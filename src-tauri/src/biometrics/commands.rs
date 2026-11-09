//! Tauri commands. All blocking serial work runs on the blocking pool, never on the main thread.
use serde_json::Value;
use tauri::AppHandle;

use super::protocol::BridgeError;
use super::serial::{self, ConnectionStatus, PortInfo};
use super::token;

async fn blocking<T, F>(f: F) -> Result<T, BridgeError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, BridgeError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|_| BridgeError::new("internal_error", "Background task failed", false))?
}

#[tauri::command]
pub async fn get_serial_ports() -> Result<Vec<PortInfo>, BridgeError> {
    blocking(serial::list_ports).await
}

#[tauri::command]
pub async fn connect_authenticator(app: AppHandle, port_name: String) -> Result<ConnectionStatus, BridgeError> {
    blocking(move || serial::connect(&app, &port_name)).await
}

#[tauri::command]
pub async fn disconnect_authenticator(app: AppHandle) -> Result<ConnectionStatus, BridgeError> {
    blocking(move || serial::disconnect(&app)).await
}

#[tauri::command]
pub fn get_authenticator_connection_status(app: AppHandle) -> ConnectionStatus {
    serial::status(&app)
}

/// Allow-listed firmware commands (hello, ping, get_status, finger_detected, get_template_info, health_check,
/// cancel, delete_template, clear_templates). Returns the response `data`; device errors reject with BridgeError.
/// The enrollment token is injected in Rust where the firmware requires it.
#[tauri::command]
pub async fn authenticator_send_command(
    app: AppHandle,
    command: String,
    params: Option<Value>,
) -> Result<Value, BridgeError> {
    blocking(move || serial::command(&app, &command, params)).await
}

#[tauri::command]
pub async fn authenticator_enroll(app: AppHandle, slot: u16, timeout_ms: Option<u32>) -> Result<Value, BridgeError> {
    blocking(move || serial::enroll(&app, slot, timeout_ms.unwrap_or(15_000))).await
}

#[tauri::command]
pub async fn save_enrollment_token(token: String) -> Result<bool, BridgeError> {
    blocking(move || token::save(&token).map(|_| true)).await
}

#[tauri::command]
pub async fn clear_enrollment_token() -> Result<bool, BridgeError> {
    blocking(|| token::clear().map(|_| true)).await
}

#[tauri::command]
pub async fn get_enrollment_token_status() -> Result<bool, BridgeError> {
    blocking(token::is_configured).await
}
