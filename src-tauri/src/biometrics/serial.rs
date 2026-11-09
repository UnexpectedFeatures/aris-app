//! USB serial bridge to the ARIS authenticator.
//! One connection, one reader thread, many in-flight requests correlated by requestId.

use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use serialport::SerialPort;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use super::protocol::{
    build_request, is_allowed, needs_token, parse_line, redact, response_into_result, BridgeError, Framer, Kind,
    Message, Parsed, BAUD_RATE, PROTOCOL, PROTOCOL_VERSION,
};
use super::token;

// ------------------------------ event names ------------------------------
pub mod evt {
    pub const CONNECTED: &str = "authenticator://connected";
    pub const DISCONNECTED: &str = "authenticator://disconnected";
    pub const DEVICE_READY: &str = "authenticator://device-ready";
    pub const STATUS: &str = "authenticator://status";
    pub const TEMPLATE_INFO: &str = "authenticator://template-info";
    pub const ENROLLMENT_STARTED: &str = "authenticator://enrollment-started";
    pub const ENROLLMENT_PROGRESS: &str = "authenticator://enrollment-progress";
    pub const ENROLLMENT_COMPLETED: &str = "authenticator://enrollment-completed";
    pub const ENROLLMENT_FAILED: &str = "authenticator://enrollment-failed";
    pub const OPERATION_CANCELLED: &str = "authenticator://operation-cancelled";
    pub const ERROR: &str = "authenticator://error";
    /// Raw (redacted) feed of every parsed device message.
    pub const MESSAGE: &str = "authenticator://message";
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

fn diag(msg: &str) {
    // Diagnostics only: never pass request bodies, tokens or raw device lines here.
    eprintln!("[authenticator] {msg}");
}

fn emit<S: Serialize + Clone>(app: &AppHandle, name: &str, payload: S) {
    if app.emit(name, payload).is_err() {
        diag("failed to emit frontend event");
    }
}

// ------------------------------ public types -----------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub name: String,
    pub kind: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub device_id: String,
    pub firmware_version: Option<String>,
    pub model: Option<String>,
    pub sensor_status: Option<String>,
    pub enroll_auth_required: bool,
    pub protocol_version: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub connected: bool,
    pub port_name: Option<String>,
    pub baud_rate: u32,
    pub busy: bool,
    pub device: Option<DeviceInfo>,
}

impl ConnectionStatus {
    fn disconnected() -> Self {
        Self { connected: false, port_name: None, baud_rate: BAUD_RATE, busy: false, device: None }
    }
}

// ------------------------------ connection -------------------------------

struct Pending {
    tx: Sender<Result<Message, BridgeError>>,
    activity: Arc<Mutex<Instant>>,
}

pub struct Conn {
    port_name: String,
    writer: Mutex<Box<dyn SerialPort>>,
    pending: Mutex<HashMap<String, Pending>>,
    stop: AtomicBool,
    info: Mutex<Option<DeviceInfo>>,
    /// True while an enrollment owns the sensor; blocks sensor-touching commands on the Rust side too.
    op_active: AtomicBool,
    reader: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Default)]
pub struct AuthenticatorState {
    conn: Mutex<Option<Arc<Conn>>>,
    connecting: AtomicBool,
}

impl Conn {
    fn write_line(&self, line: &str) -> io::Result<()> {
        let mut w = lock(&self.writer);
        w.write_all(line.as_bytes())?;
        w.write_all(b"\n")?;
        w.flush()
    }

    fn fail_all(&self, err: BridgeError) {
        let drained: Vec<Pending> = lock(&self.pending).drain().map(|(_, p)| p).collect();
        for p in drained {
            let _ = p.tx.send(Err(err.clone()));
        }
    }

    fn touch(&self, id: &str) {
        if let Some(p) = lock(&self.pending).get(id) {
            *lock(&p.activity) = Instant::now();
        }
    }

    /// Sends one request and blocks the CALLING thread (never the Tauri main thread: callers use spawn_blocking)
    /// until the matching *response* arrives. Events with the same requestId only refresh the idle timer.
    fn request(
        &self,
        command: &str,
        params: Option<&Value>,
        token: Option<&str>,
        idle: Duration,
    ) -> Result<Message, BridgeError> {
        if self.stop.load(Ordering::SeqCst) {
            return Err(disconnected_err());
        }
        let id = format!("aris-{}", Uuid::new_v4());
        let (tx, rx) = mpsc::channel();
        let activity = Arc::new(Mutex::new(Instant::now()));
        {
            let mut p = lock(&self.pending);
            if p.contains_key(&id) {
                return Err(BridgeError::new("duplicate_request_id", "Request id already active", false));
            }
            p.insert(id.clone(), Pending { tx, activity: activity.clone() });
        }
        let line = match build_request(&id, command, params, token) {
            Ok(l) => l,
            Err(e) => {
                lock(&self.pending).remove(&id);
                return Err(e);
            }
        };
        let write = self.write_line(&line);
        drop(line);
        if write.is_err() {
            lock(&self.pending).remove(&id);
            return Err(BridgeError::new("io_error", "Could not write to the serial port", true));
        }
        loop {
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(r) => return r,
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if lock(&activity).elapsed() > idle {
                        lock(&self.pending).remove(&id);
                        return Err(BridgeError::new(
                            "timeout",
                            "The authenticator did not answer in time",
                            true,
                        ));
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => return Err(disconnected_err()),
            }
        }
    }
}

fn disconnected_err() -> BridgeError {
    BridgeError::new("disconnected", "The authenticator was disconnected", true)
}

fn not_connected_err() -> BridgeError {
    BridgeError::new("not_connected", "No authenticator is connected", false)
}

fn get_conn(app: &AppHandle) -> Result<Arc<Conn>, BridgeError> {
    let state = app.state::<AuthenticatorState>();
    let g = lock(&state.conn);
    g.as_ref().cloned().ok_or_else(not_connected_err)
}

fn teardown(conn: &Arc<Conn>) {
    conn.stop.store(true, Ordering::SeqCst);
    conn.fail_all(disconnected_err());
    let handle = lock(&conn.reader).take();
    if let Some(h) = handle {
        if h.thread().id() != thread::current().id() {
            let _ = h.join(); // reader wakes every 100 ms, then releases its port handle
        }
    }
}

// ------------------------------- reader ----------------------------------

fn on_fatal(app: &AppHandle, conn: &Arc<Conn>, reason: &str) {
    if conn.stop.swap(true, Ordering::SeqCst) {
        return; // deliberate disconnect already handled
    }
    conn.fail_all(disconnected_err());
    let state = app.state::<AuthenticatorState>();
    let was_current = {
        let mut g = lock(&state.conn);
        match g.as_ref() {
            Some(c) if Arc::ptr_eq(c, conn) => {
                *g = None;
                true
            }
            _ => false,
        }
    };
    if was_current {
        diag(&format!("port lost: {reason}"));
        emit(app, evt::DISCONNECTED, json!({ "reason": reason, "portName": conn.port_name }));
    }
}

fn reader_loop(app: AppHandle, conn: Arc<Conn>, mut port: Box<dyn SerialPort>) {
    let mut framer = Framer::default();
    let mut buf = [0u8; 512];
    while !conn.stop.load(Ordering::SeqCst) {
        match port.read(&mut buf) {
            Ok(0) => {}
            Ok(n) => {
                let out = framer.push(&buf[..n]);
                if out.overflow {
                    emit(&app, evt::ERROR, json!({ "code": "frame_overflow", "message": "Discarded an oversized serial frame" }));
                }
                for line in out.lines {
                    match parse_line(&line) {
                        Parsed::Noise | Parsed::Foreign => {}
                        Parsed::Malformed => emit(
                            &app,
                            evt::ERROR,
                            json!({ "code": "malformed_json", "message": "Received an invalid message from the device" }),
                        ),
                        Parsed::Message(m) => process_message(&app, &conn, m),
                    }
                }
            }
            Err(e) if matches!(e.kind(), io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) => {}
            Err(_) => {
                on_fatal(&app, &conn, "port_closed");
                break;
            }
        }
    }
}

fn derived(msg: &Message) -> Value {
    json!({
        "requestId": msg.request_id,
        "command": msg.command,
        "event": msg.event,
        "data": redact(&msg.raw).get("data").cloned().unwrap_or(Value::Null),
    })
}

fn process_message(app: &AppHandle, conn: &Arc<Conn>, msg: Message) {
    emit(app, evt::MESSAGE, redact(&msg.raw));

    match msg.kind {
        Kind::Event => {
            if let Some(id) = &msg.request_id {
                conn.touch(id);
            }
            match (msg.command.as_deref(), msg.event.as_deref()) {
                (_, Some("device_ready")) => emit(app, evt::DEVICE_READY, derived(&msg)),
                (_, Some("sensor_status")) => emit(app, evt::STATUS, derived(&msg)),
                (Some("enroll"), Some("started")) => emit(app, evt::ENROLLMENT_STARTED, derived(&msg)),
                (Some("enroll"), Some("enroll_progress" | "capture_retry")) => {
                    emit(app, evt::ENROLLMENT_PROGRESS, derived(&msg))
                }
                _ => {}
            }
        }
        Kind::Response => {
            if msg.success {
                match msg.command.as_deref() {
                    Some("cancel") if msg.data.get("cancelled").and_then(Value::as_bool) == Some(true) => {
                        emit(app, evt::OPERATION_CANCELLED, derived(&msg))
                    }
                    Some("get_template_info") => emit(app, evt::TEMPLATE_INFO, derived(&msg)),
                    Some("get_status" | "health_check") => emit(app, evt::STATUS, derived(&msg)),
                    _ => {}
                }
            }
            let pending = {
                let mut m = lock(&conn.pending);
                msg.request_id.as_ref().and_then(|i| m.remove(i))
            };
            match pending {
                Some(p) => {
                    let _ = p.tx.send(Ok(msg));
                }
                None => {
                    if !msg.success {
                        emit(app, evt::ERROR, json!({ "code": "device_error", "error": msg.error }));
                    }
                }
            }
        }
    }
}

// ------------------------------ public API -------------------------------

pub fn list_ports() -> Result<Vec<PortInfo>, BridgeError> {
    let ports = serialport::available_ports()
        .map_err(|_| BridgeError::new("enumeration_failed", "Could not list serial ports", true))?;
    Ok(ports
        .into_iter()
        .map(|p| {
            let (kind, vid, pid, manufacturer, product) = match p.port_type {
                serialport::SerialPortType::UsbPort(u) => ("usb", Some(u.vid), Some(u.pid), u.manufacturer, u.product),
                serialport::SerialPortType::BluetoothPort => ("bluetooth", None, None, None, None),
                serialport::SerialPortType::PciPort => ("pci", None, None, None, None),
                serialport::SerialPortType::Unknown => ("unknown", None, None, None, None),
            };
            PortInfo { name: p.port_name, kind: kind.into(), vid, pid, manufacturer, product }
        })
        .collect())
}

fn map_open_error(e: serialport::Error) -> BridgeError {
    use serialport::ErrorKind;
    match e.kind() {
        ErrorKind::NoDevice => BridgeError::new("port_not_found", "That COM port no longer exists", true),
        ErrorKind::Io(io::ErrorKind::PermissionDenied) => BridgeError::new(
            "port_busy",
            "The port is in use or access was denied. Close Arduino Serial Monitor or any other program using it, then retry",
            true,
        ),
        ErrorKind::Io(io::ErrorKind::NotFound) => BridgeError::new("port_not_found", "That COM port no longer exists", true),
        _ => BridgeError::new("port_open_failed", "Could not open the serial port. It may be in use by another program (e.g. Arduino Serial Monitor)", true),
    }
}

pub fn status(app: &AppHandle) -> ConnectionStatus {
    let state = app.state::<AuthenticatorState>();
    let g = lock(&state.conn);
    match g.as_ref() {
        Some(c) => ConnectionStatus {
            connected: !c.stop.load(Ordering::SeqCst),
            port_name: Some(c.port_name.clone()),
            baud_rate: BAUD_RATE,
            busy: c.op_active.load(Ordering::SeqCst),
            device: lock(&c.info).clone(),
        },
        None => ConnectionStatus::disconnected(),
    }
}

pub fn connect(app: &AppHandle, port_name: &str) -> Result<ConnectionStatus, BridgeError> {
    let state = app.state::<AuthenticatorState>();
    if lock(&state.conn).is_some() {
        return Err(BridgeError::new("already_connected", "Disconnect the current authenticator first", false));
    }
    if state.connecting.swap(true, Ordering::SeqCst) {
        return Err(BridgeError::new("busy", "A connection attempt is already in progress", true));
    }
    let result = connect_inner(app, port_name);
    state.connecting.store(false, Ordering::SeqCst);
    result
}

fn connect_inner(app: &AppHandle, port_name: &str) -> Result<ConnectionStatus, BridgeError> {
    let mut port = serialport::new(port_name, BAUD_RATE)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(map_open_error)?;
    // Keep DTR/RTS low: on most ESP32 boards they drive EN/IO0 (auto-reset). A reset can still happen once on open.
    let _ = port.write_data_terminal_ready(false);
    let _ = port.write_request_to_send(false);
    let reader_port = port
        .try_clone()
        .map_err(|_| BridgeError::new("port_open_failed", "Could not duplicate the serial handle", false))?;

    let conn = Arc::new(Conn {
        port_name: port_name.to_string(),
        writer: Mutex::new(port),
        pending: Mutex::new(HashMap::new()),
        stop: AtomicBool::new(false),
        info: Mutex::new(None),
        op_active: AtomicBool::new(false),
        reader: Mutex::new(None),
    });

    let handle = {
        let (a, c) = (app.clone(), conn.clone());
        thread::Builder::new()
            .name("aris-serial-reader".into())
            .spawn(move || reader_loop(a, c, reader_port))
            .map_err(|_| BridgeError::new("port_open_failed", "Could not start the serial reader", false))?
    };
    *lock(&conn.reader) = Some(handle);

    // Opening the port may reset the ESP32; give it time to boot, then handshake (with retries).
    thread::sleep(Duration::from_millis(2000));
    let mut last: Option<BridgeError> = None;
    let mut hello: Option<Message> = None;
    for _ in 0..4 {
        match conn.request("hello", None, None, Duration::from_millis(2000)) {
            Ok(m) => {
                hello = Some(m);
                break;
            }
            Err(e) => {
                let fatal = e.code == "disconnected" || e.code == "io_error";
                last = Some(e);
                if fatal {
                    break;
                }
            }
        }
    }

    let fail = |conn: &Arc<Conn>, e: BridgeError| -> Result<ConnectionStatus, BridgeError> {
        teardown(conn);
        Err(e)
    };

    let msg = match hello {
        Some(m) => m,
        None => {
            let e = last.unwrap_or_else(|| BridgeError::new("no_response", "No response", true));
            let e = if e.code == "timeout" {
                BridgeError::new("not_aris_device", "No ARIS authenticator answered on this port", true)
            } else {
                e
            };
            return fail(&conn, e);
        }
    };
    let data = match response_into_result(msg) {
        Ok(d) => d,
        Err(e) => return fail(&conn, e),
    };
    let proto_ok = data.get("protocol").and_then(Value::as_str) == Some(PROTOCOL)
        && data.get("protocolVersion").and_then(Value::as_u64) == Some(PROTOCOL_VERSION);
    let device_id = data.get("deviceId").and_then(Value::as_str).map(str::to_string);
    let (true, Some(device_id)) = (proto_ok, device_id) else {
        return fail(
            &conn,
            BridgeError::new("not_aris_device", "The device does not speak aris-biometric protocol v1", false),
        );
    };
    let s = |k: &str| data.get(k).and_then(Value::as_str).map(str::to_string);
    *lock(&conn.info) = Some(DeviceInfo {
        device_id,
        firmware_version: s("firmwareVersion"),
        model: s("model"),
        sensor_status: s("sensorStatus"),
        // If the field is missing, assume a token is required (fail safe).
        enroll_auth_required: data.get("enrollAuthRequired").and_then(Value::as_bool).unwrap_or(true),
        protocol_version: PROTOCOL_VERSION,
    });

    *lock(&app.state::<AuthenticatorState>().conn) = Some(conn);
    let st = status(app);
    emit(app, evt::CONNECTED, st.clone());
    Ok(st)
}

pub fn disconnect(app: &AppHandle) -> Result<ConnectionStatus, BridgeError> {
    let taken = lock(&app.state::<AuthenticatorState>().conn).take();
    if let Some(conn) = taken {
        teardown(&conn);
        emit(app, evt::DISCONNECTED, json!({ "reason": "user", "portName": conn.port_name }));
    }
    Ok(ConnectionStatus::disconnected())
}

/// Called on app exit so the COM port is released.
pub fn shutdown(app: &AppHandle) {
    let _ = disconnect(app);
}

fn token_for(conn: &Conn, command: &str) -> Result<Option<String>, BridgeError> {
    if !needs_token(command) {
        return Ok(None);
    }
    let required = lock(&conn.info).as_ref().map(|i| i.enroll_auth_required).unwrap_or(true);
    if !required {
        return Ok(None);
    }
    match token::load()? {
        Some(t) => Ok(Some(t)),
        None => Err(BridgeError::new(
            "token_not_configured",
            "The enrollment token is not configured. Save it first",
            false,
        )),
    }
}

/// Generic allow-listed command. `enroll` has its own entry point (long-running, lifecycle events).
pub fn command(app: &AppHandle, command: &str, params: Option<Value>) -> Result<Value, BridgeError> {
    if !is_allowed(command) || command == "enroll" {
        return Err(BridgeError::new("forbidden_command", "This command cannot be sent from the frontend", false));
    }
    let conn = get_conn(app)?;
    let sensor_free_ok = matches!(command, "cancel" | "ping" | "get_status" | "hello" | "finger_detected");
    if conn.op_active.load(Ordering::SeqCst) && !sensor_free_ok {
        return Err(BridgeError::new(
            "operation_in_progress",
            "An enrollment is running; wait for it to finish or cancel it",
            true,
        ));
    }
    if command == "delete_template" {
        let ok = params.as_ref().and_then(|p| p.get("slot")).and_then(Value::as_u64).is_some();
        if !ok {
            return Err(BridgeError::new("invalid_slot", "'slot' (non-negative integer) is required", false));
        }
    }
    let token = token_for(&conn, command)?;
    let idle = match command {
        "get_template_info" | "health_check" | "delete_template" | "clear_templates" => Duration::from_secs(12),
        _ => Duration::from_secs(5),
    };
    let msg = conn.request(command, params.as_ref(), token.as_deref(), idle)?;
    response_into_result(msg)
}

struct OpGuard<'a>(&'a AtomicBool);
impl Drop for OpGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Starts an enrollment and waits for the FINAL response. `started` / `enroll_progress` / `capture_retry`
/// events refresh the idle timer and are forwarded, but never resolve the request.
pub fn enroll(app: &AppHandle, slot: u16, timeout_ms: u32) -> Result<Value, BridgeError> {
    if !(1000..=60000).contains(&timeout_ms) {
        return Err(BridgeError::new("invalid_request", "timeoutMs must be between 1000 and 60000", false));
    }
    let conn = get_conn(app)?;
    let token = token_for(&conn, "enroll")?;
    if conn.op_active.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Err(BridgeError::new("operation_in_progress", "An enrollment is already running", true));
    }
    let _guard = OpGuard(&conn.op_active);

    let params = json!({ "slot": slot, "timeoutMs": timeout_ms }); // never "overwrite"
    let idle = Duration::from_millis(timeout_ms as u64 + 5000);
    let result = conn
        .request("enroll", Some(&params), token.as_deref(), idle)
        .and_then(response_into_result);
    match &result {
        Ok(data) => emit(app, evt::ENROLLMENT_COMPLETED, json!({ "command": "enroll", "data": data })),
        Err(e) => emit(app, evt::ENROLLMENT_FAILED, json!({ "command": "enroll", "error": e })),
    }
    result
}
