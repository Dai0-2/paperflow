use base64::{engine::general_purpose::STANDARD, Engine as _};
use keyring::{Entry, Error as KeyringError};
use thiserror::Error;
use uuid::Uuid;
use zeroize::Zeroizing;

const SERVICE: &str = "com.paperflow.ai";
#[cfg(target_os = "macos")]
const LEGACY_SERVICE: &str = "PaperFlow AI";
const API_KEY_ACCOUNT: &str = "openai_api_key";
const VAULT_ACCOUNT_PREFIX: &str = "vault_device_key:";

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("The operating-system credential store is unavailable.")]
    Unavailable,
    #[error("No saved credential was found.")]
    NotFound,
    #[error("The saved credential is invalid.")]
    Invalid,
    #[error("Could not access the operating-system credential store.")]
    Access,
}

fn entry(service: &str, account: &str) -> Result<Entry, SecretError> {
    Entry::new(service, account).map_err(|_| SecretError::Unavailable)
}

fn read_from(service: &str, account: &str) -> Result<Zeroizing<String>, SecretError> {
    match entry(service, account)?.get_password() {
        Ok(secret) => Ok(Zeroizing::new(secret)),
        Err(KeyringError::NoEntry) => Err(SecretError::NotFound),
        Err(KeyringError::PlatformFailure(_)) => Err(SecretError::Unavailable),
        Err(_) => Err(SecretError::Access),
    }
}

fn read(account: &str) -> Result<Zeroizing<String>, SecretError> {
    match read_from(SERVICE, account) {
        Ok(secret) => Ok(secret),
        Err(SecretError::NotFound) => {
            let legacy = read_legacy(account)?;
            store_to(SERVICE, account, &legacy)?;
            Ok(legacy)
        }
        Err(error) => Err(error),
    }
}

fn store_to(service: &str, account: &str, secret: &str) -> Result<(), SecretError> {
    entry(service, account)?
        .set_password(secret)
        .map_err(|error| match error {
            KeyringError::PlatformFailure(_) => SecretError::Unavailable,
            _ => SecretError::Access,
        })
}

fn delete_from(service: &str, account: &str) -> Result<(), SecretError> {
    match entry(service, account)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(KeyringError::PlatformFailure(_)) => Err(SecretError::Unavailable),
        Err(_) => Err(SecretError::Access),
    }
}

fn store(account: &str, secret: &str) -> Result<(), SecretError> {
    store_to(SERVICE, account, secret)
}

fn delete(account: &str) -> Result<(), SecretError> {
    delete_from(SERVICE, account)?;
    delete_legacy(account)
}

#[cfg(target_os = "macos")]
fn read_legacy(account: &str) -> Result<Zeroizing<String>, SecretError> {
    let result = std::process::Command::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-a",
            account,
            "-s",
            LEGACY_SERVICE,
            "-w",
        ])
        .output()
        .map_err(|_| SecretError::Access)?;
    if result.status.success() {
        return String::from_utf8(result.stdout)
            .map(|value| Zeroizing::new(value.trim().to_owned()))
            .map_err(|_| SecretError::Invalid);
    }
    match result.status.code() {
        Some(44) => Err(SecretError::NotFound),
        _ => Err(SecretError::Access),
    }
}

#[cfg(not(target_os = "macos"))]
fn read_legacy(_account: &str) -> Result<Zeroizing<String>, SecretError> {
    Err(SecretError::NotFound)
}

#[cfg(target_os = "macos")]
fn delete_legacy(account: &str) -> Result<(), SecretError> {
    let result = std::process::Command::new("/usr/bin/security")
        .args([
            "delete-generic-password",
            "-a",
            account,
            "-s",
            LEGACY_SERVICE,
        ])
        .output()
        .map_err(|_| SecretError::Access)?;
    match result.status.code() {
        Some(0 | 44) => Ok(()),
        _ => Err(SecretError::Access),
    }
}

#[cfg(not(target_os = "macos"))]
fn delete_legacy(_account: &str) -> Result<(), SecretError> {
    Ok(())
}

pub fn credential_store_available() -> bool {
    match read(API_KEY_ACCOUNT) {
        Ok(_) | Err(SecretError::NotFound) => true,
        Err(_) => false,
    }
}

pub fn api_key_configured() -> bool {
    read(API_KEY_ACCOUNT)
        .map(|secret| !secret.is_empty())
        .unwrap_or(false)
}

pub fn load_api_key() -> Result<Zeroizing<String>, SecretError> {
    let secret = read(API_KEY_ACCOUNT)?;
    if secret.len() < 8 || secret.chars().any(char::is_whitespace) {
        return Err(SecretError::Invalid);
    }
    Ok(secret)
}

pub fn store_api_key(api_key: &str) -> Result<(), SecretError> {
    if api_key.len() < 8 || api_key.len() > 512 || api_key.chars().any(char::is_whitespace) {
        return Err(SecretError::Invalid);
    }
    store(API_KEY_ACCOUNT, api_key)
}

pub fn delete_api_key() -> Result<(), SecretError> {
    delete(API_KEY_ACCOUNT)
}

fn vault_account(vault_id: Uuid) -> String {
    format!("{VAULT_ACCOUNT_PREFIX}{vault_id}")
}

pub fn store_vault_key(vault_id: Uuid, encoded_key: &str) -> Result<(), SecretError> {
    let decoded = STANDARD
        .decode(encoded_key)
        .map_err(|_| SecretError::Invalid)?;
    if decoded.len() != 32 {
        return Err(SecretError::Invalid);
    }
    store(&vault_account(vault_id), encoded_key)
}

pub fn load_vault_key(vault_id: Uuid) -> Result<Zeroizing<String>, SecretError> {
    let encoded = read(&vault_account(vault_id))?;
    let decoded = STANDARD
        .decode(encoded.as_bytes())
        .map_err(|_| SecretError::Invalid)?;
    if decoded.len() != 32 {
        return Err(SecretError::Invalid);
    }
    Ok(encoded)
}

pub fn delete_vault_key(vault_id: Uuid) -> Result<(), SecretError> {
    delete(&vault_account(vault_id))
}

pub fn platform_store_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macOS Keychain"
    }
    #[cfg(target_os = "windows")]
    {
        "Windows Credential Manager"
    }
    #[cfg(target_os = "linux")]
    {
        "Linux Secret Service"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_account_is_stable_and_scoped() {
        let id = Uuid::parse_str("18ea83a8-49f8-4e32-970f-02cbf129d4c2").unwrap();
        assert_eq!(
            vault_account(id),
            "vault_device_key:18ea83a8-49f8-4e32-970f-02cbf129d4c2"
        );
    }

    #[test]
    fn rejects_invalid_vault_key_before_store_access() {
        let id = Uuid::nil();
        assert!(matches!(
            store_vault_key(id, "not-base64"),
            Err(SecretError::Invalid)
        ));
    }
}
