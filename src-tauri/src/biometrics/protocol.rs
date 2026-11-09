//! aris-biometric protocol v1: request building, newline framing, message parsing.
//! Pure logic, no I/O, no Tauri types (unit-testable).

use serde::Serialize;
use serde_json::{json, Map, Value};

pub const PROTOCOL: &str = "aris-biometric";
pub const PROTOCOL_VERSION: u64 = 1;
pub const BAUD_RATE: u32 = 115_200; // host <-> ESP32. (57600 is the sensor UART, never used here.)

const MAX_FRAME: usize = 16 * 1024; // incoming line without '\n' beyond this is dropped
const MAX_REQUEST_BYTES: usize = 500; // firmware rejects lines > 512 bytes

/// Only these commands can be sent by the frontend. wifi_*, prov_*, server_set and listen_set are
/// deliberately excluded (secrets / persistent device config). `match` is allowed: it only verifies a finger
/// and needs no token; the app sends the punch to the server itself.
pub const ALLOWED_COMMANDS: &[&str] = &[
    "hello",
    "ping",
    "get_status",
    "finger_detected",
    "get_template_info",
    "health_check",
    "match",
    "enroll",
    "cancel",
    "delete_template",
    "clear_templates",
];

/// Keys the frontend may never inject. authToken is added by Rust only; overwrite is never sent.
const RESERVED_KEYS: &[&str] = &["protocol", "protocolVersion", "requestId", "command", "authToken", "overwrite"];

pub fn is_allowed(command: &str) -> bool {
    ALLOWED_COMMANDS.contains(&command)
}

pub fn needs_token(command: &str) -> bool {
    matches!(command, "enroll" | "delete_template" | "clear_templates")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sensor_code: Option<i64>,
}

impl BridgeError {
    pub fn new(code: &str, message: impl Into<String>, retryable: bool) -> Self {
        Self { code: code.to_string(), message: message.into(), retryable, sensor_code: None }
    }
}

pub fn build_request(
    request_id: &str,
    command: &str,
    params: Option<&Value>,
    token: Option<&str>,
) -> Result<String, BridgeError> {
    let mut obj = Map::new();
    match params {
        None | Some(Value::Null) => {}
        Some(Value::Object(p)) => {
            for (k, v) in p {
                if !RESERVED_KEYS.contains(&k.as_str()) {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
        Some(_) => return Err(BridgeError::new("invalid_params", "Command parameters must be a JSON object", false)),
    }
    obj.insert("protocol".into(), json!(PROTOCOL));
    obj.insert("protocolVersion".into(), json!(PROTOCOL_VERSION));
    obj.insert("requestId".into(), json!(request_id));
    obj.insert("command".into(), json!(command));
    if let Some(t) = token {
        obj.insert("authToken".into(), json!(t));
    }
    let line = serde_json::to_string(&Value::Object(obj))
        .map_err(|_| BridgeError::new("invalid_params", "Could not serialize request", false))?;
    if line.len() > MAX_REQUEST_BYTES {
        return Err(BridgeError::new("request_too_large", "Request exceeds the device's 512 byte limit", false));
    }
    Ok(line)
}

// ------------------------------- framing ---------------------------------

#[derive(Default)]
pub struct Framer {
    buf: Vec<u8>,
}

pub struct FrameOut {
    pub lines: Vec<String>,
    pub overflow: bool,
}

impl Framer {
    /// Feed raw bytes; returns every complete, non-empty line (LF or CRLF terminated).
    pub fn push(&mut self, bytes: &[u8]) -> FrameOut {
        self.buf.extend_from_slice(bytes);
        let mut lines = Vec::new();
        while let Some(pos) = self.buf.iter().position(|b| *b == b'\n') {
            let raw: Vec<u8> = self.buf.drain(..=pos).collect();
            let text = String::from_utf8_lossy(&raw[..raw.len() - 1]);
            let t = text.trim();
            if !t.is_empty() {
                lines.push(t.to_string());
            }
        }
        let overflow = self.buf.len() > MAX_FRAME;
        if overflow {
            self.buf.clear();
        }
        FrameOut { lines, overflow }
    }
}

// ------------------------------- parsing ---------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum Kind {
    Response,
    Event,
}

#[derive(Debug, Clone)]
pub struct Message {
    pub kind: Kind,
    pub request_id: Option<String>,
    pub command: Option<String>,
    pub event: Option<String>,
    pub success: bool,
    pub data: Value,
    pub error: Value,
    pub raw: Value,
}

pub enum Parsed {
    /// Not JSON (ESP32 boot ROM text etc.). Ignored silently.
    Noise,
    /// Looks like JSON but is invalid, or has no valid `type`.
    Malformed,
    /// Valid JSON that is not the aris-biometric protocol.
    Foreign,
    Message(Message),
}

fn opt_str(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}

pub fn parse_line(line: &str) -> Parsed {
    if !line.starts_with('{') {
        return Parsed::Noise;
    }
    let v: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return Parsed::Malformed,
    };
    if v.get("protocol").and_then(Value::as_str) != Some(PROTOCOL) {
        return Parsed::Foreign;
    }
    let kind = match v.get("type").and_then(Value::as_str) {
        Some("response") => Kind::Response,
        Some("event") => Kind::Event,
        _ => return Parsed::Malformed,
    };
    Parsed::Message(Message {
        kind,
        request_id: opt_str(&v, "requestId"),
        command: opt_str(&v, "command"),
        event: opt_str(&v, "event"),
        success: v.get("success").and_then(Value::as_bool).unwrap_or(false),
        data: v.get("data").cloned().unwrap_or(Value::Null),
        error: v.get("error").cloned().unwrap_or(Value::Null),
        raw: v,
    })
}

/// Success -> data. Failure -> firmware error mapped to BridgeError (code/message/retryable/sensorCode preserved).
pub fn response_into_result(msg: Message) -> Result<Value, BridgeError> {
    if msg.success {
        return Ok(msg.data);
    }
    let e = &msg.error;
    Err(BridgeError {
        code: opt_str(e, "code").unwrap_or_else(|| "device_error".into()),
        message: opt_str(e, "message").unwrap_or_else(|| "The device reported an error".into()),
        retryable: e.get("retryable").and_then(Value::as_bool).unwrap_or(false),
        sensor_code: e.get("sensorCode").and_then(Value::as_i64),
    })
}

/// Removes setup secrets (the firmware may announce its provisioning portal over USB at boot).
pub fn redact(raw: &Value) -> Value {
    let mut v = raw.clone();
    if v.get("event").and_then(Value::as_str) == Some("provisioning_started") {
        if let Some(Value::Object(d)) = v.get_mut("data") {
            for k in ["apPassword", "token", "url"] {
                d.remove(k);
            }
        }
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_fragments_multiples_and_crlf() {
        let mut f = Framer::default();
        assert!(f.push(b"{\"a\":").lines.is_empty());
        let out = f.push(b"1}\r\n{\"b\":2}\n\n{\"c\"");
        assert_eq!(out.lines, vec!["{\"a\":1}", "{\"b\":2}"]);
        assert_eq!(f.push(b":3}\n").lines, vec!["{\"c\":3}"]);
    }

    #[test]
    fn noise_malformed_foreign() {
        assert!(matches!(parse_line("ets Jun  8 2016"), Parsed::Noise));
        assert!(matches!(parse_line("{bad"), Parsed::Malformed));
        assert!(matches!(parse_line("{\"x\":1}"), Parsed::Foreign));
        assert!(matches!(
            parse_line("{\"protocol\":\"aris-biometric\",\"type\":\"nope\"}"),
            Parsed::Malformed
        ));
    }

    #[test]
    fn response_and_error_mapping() {
        let ok = parse_line(
            "{\"protocol\":\"aris-biometric\",\"protocolVersion\":1,\"requestId\":\"r\",\"type\":\"response\",\"command\":\"ping\",\"success\":true,\"data\":{\"pong\":true},\"error\":null}",
        );
        match ok {
            Parsed::Message(m) => assert_eq!(response_into_result(m).unwrap()["pong"], true),
            _ => panic!(),
        }
        let bad = parse_line(
            "{\"protocol\":\"aris-biometric\",\"requestId\":\"r\",\"type\":\"response\",\"command\":\"enroll\",\"success\":false,\"data\":null,\"error\":{\"code\":\"enrollment_blocked\",\"message\":\"m\",\"retryable\":false}}",
        );
        match bad {
            Parsed::Message(m) => assert_eq!(response_into_result(m).unwrap_err().code, "enrollment_blocked"),
            _ => panic!(),
        }
    }

    #[test]
    fn request_strips_reserved_keys() {
        let p = json!({"slot": 1, "overwrite": true, "authToken": "evil", "requestId": "x"});
        let line = build_request("id1", "enroll", Some(&p), Some("tok")).unwrap();
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["authToken"], "tok");
        assert_eq!(v["requestId"], "id1");
        assert!(v.get("overwrite").is_none());
        assert_eq!(v["slot"], 1);
    }

    #[test]
    fn match_is_allowed_without_token() {
        assert!(is_allowed("match"));
        assert!(!needs_token("match"));
    }
}