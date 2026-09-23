mod api;
mod codex;
mod protocol;
mod secrets;

use std::io;

use protocol::{read_request, write_response, Request, Response, PROTOCOL_VERSION};
use secrets::SecretError;

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = stdin.lock();
    let mut writer = stdout.lock();

    loop {
        let request = match read_request(&mut reader) {
            Ok(Some(request)) => request,
            Ok(None) => return,
            Err(error) => {
                let _ = write_response(&mut writer, &Response::error(error.to_string()));
                return;
            }
        };
        let mut emit = |response: Response| {
            let _ = write_response(&mut writer, &response);
        };
        let response = handle(request, &mut emit);
        if write_response(&mut writer, &response).is_err() {
            return;
        }
    }
}

fn handle(request: Request, emit: &mut impl FnMut(Response)) -> Response {
    match request {
        Request::Status => {
            let mut response = Response::success();
            response.protocol_version = Some(PROTOCOL_VERSION);
            response.host_version = Some(env!("CARGO_PKG_VERSION"));
            response.platform = Some(std::env::consts::OS);
            response.codex_available = Some(codex::find_executable().is_some());
            response.credential_store_available = Some(secrets::credential_store_available());
            response.api_key_configured = Some(secrets::api_key_configured());
            response.detail = Some("PaperFlow native host is available.".to_owned());
            response
        }
        Request::CodexAuthStatus => match codex::auth_status() {
            Ok((authenticated, detail)) => {
                let mut response = Response::success();
                response.authenticated = Some(authenticated);
                response.detail = Some(if detail.is_empty() {
                    if authenticated {
                        "Codex CLI is signed in.".to_owned()
                    } else {
                        "Run `codex login` in a terminal, then check again.".to_owned()
                    }
                } else {
                    detail
                });
                response
            }
            Err(error) => unavailable(error.to_string()),
        },
        Request::CodexChat {
            question,
            context,
            images,
            model,
            response_language,
        } => {
            emit(Response::event("progress", "accepted"));
            match codex::chat(
                &question,
                &context,
                &images,
                model.as_deref(),
                response_language,
                emit,
            ) {
                Ok(answer) => complete(answer),
                Err(error) => Response::error(error.to_string()),
            }
        }
        Request::ApiKeySet { api_key } => match secrets::store_api_key(&api_key) {
            Ok(()) => {
                let mut response = Response::success();
                response.authenticated = Some(true);
                response.detail = Some(format!(
                    "API key saved securely in {}.",
                    secrets::platform_store_name()
                ));
                response
            }
            Err(error) => Response::error(error.to_string()),
        },
        Request::ApiKeyDelete => match secrets::delete_api_key() {
            Ok(()) => {
                let mut response = Response::success();
                response.authenticated = Some(false);
                response.detail = Some("API key removed.".to_owned());
                response
            }
            Err(error) => Response::error(error.to_string()),
        },
        Request::ApiTest {
            model: _,
            base_url,
            protocol,
        } => {
            if let Err(error) = api::validate_configuration(&base_url, protocol) {
                return Response::error(error.to_string());
            }
            match secrets::load_api_key() {
                Ok(_) => {
                    let mut response = Response::success();
                    response.authenticated = Some(true);
                    response.detail =
                        Some("API key and endpoint configuration are available.".to_owned());
                    response
                }
                Err(SecretError::NotFound) => {
                    let mut response = Response::success();
                    response.authenticated = Some(false);
                    response.detail = Some("No API key is configured.".to_owned());
                    response
                }
                Err(error) => Response::error(error.to_string()),
            }
        }
        Request::ApiChat {
            question,
            context,
            images,
            model,
            base_url,
            protocol,
            response_language,
        } => match api::chat(
            api::ChatRequest {
                question: &question,
                context: &context,
                images: &images,
                model: &model,
                base_url: &base_url,
                protocol,
                language: response_language,
            },
            emit,
        ) {
            Ok(answer) => complete(answer),
            Err(error) => Response::error(error.to_string()),
        },
        Request::VaultStoreDeviceKey {
            vault_id,
            vault_key,
        } => match secrets::store_vault_key(vault_id, &vault_key) {
            Ok(()) => {
                let mut response = Response::success();
                response.authenticated = Some(true);
                response.detail = Some(format!(
                    "Vault key saved in {}.",
                    secrets::platform_store_name()
                ));
                response
            }
            Err(error) => Response::error(error.to_string()),
        },
        Request::VaultLoadDeviceKey { vault_id } => match secrets::load_vault_key(vault_id) {
            Ok(vault_key) => {
                let mut response = Response::success();
                response.authenticated = Some(true);
                response.vault_key = Some(vault_key.to_string());
                response
            }
            Err(SecretError::NotFound) => {
                let mut response = Response::success();
                response.authenticated = Some(false);
                response.detail = Some("No saved vault key for this device.".to_owned());
                response
            }
            Err(error) => Response::error(error.to_string()),
        },
        Request::VaultDeleteDeviceKey { vault_id } => match secrets::delete_vault_key(vault_id) {
            Ok(()) => {
                let mut response = Response::success();
                response.authenticated = Some(false);
                response.detail = Some("Saved vault key removed.".to_owned());
                response
            }
            Err(error) => Response::error(error.to_string()),
        },
    }
}

fn complete(answer: String) -> Response {
    let mut response = Response::success();
    response.event = Some("complete");
    response.answer = Some(answer);
    response
}

fn unavailable(message: String) -> Response {
    let mut response = Response::error(message);
    response.authenticated = Some(false);
    response
}
