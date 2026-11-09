//! Enrollment token storage in the OS credential manager (Windows Credential Manager / Keychain / Secret Service).
//! The token never crosses into the frontend and is never logged. No insecure fallback.

use super::protocol::BridgeError;
use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "aris-authenticator";
const USER: &str = "enroll-token";

fn entry() -> Result<Entry, BridgeError> {
    Entry::new(SERVICE, USER).map_err(|_| unavailable())
}

fn unavailable() -> BridgeError {
    BridgeError::new(
        "credential_store_unavailable",
        "The operating system credential manager is unavailable; the enrollment token cannot be stored securely",
        false,
    )
}

pub fn save(token: &str) -> Result<(), BridgeError> {
    let t = token.trim();
    if t.is_empty() || t.len() > 200 || t.chars().any(|c| c.is_control()) {
        return Err(BridgeError::new("invalid_token", "Token must be 1-200 printable characters", false));
    }
    entry()?.set_password(t).map_err(|_| unavailable())
}

pub fn load() -> Result<Option<String>, BridgeError> {
    match entry()?.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err(unavailable()),
    }
}

pub fn is_configured() -> Result<bool, BridgeError> {
    Ok(load()?.is_some())
}

pub fn clear() -> Result<(), BridgeError> {
    match entry()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err(unavailable()),
    }
}
