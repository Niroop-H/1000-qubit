use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};
use url::Url;
use uuid::Uuid;

fn collect_oauth_code(listener: TcpListener, expected_state: String) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|_| "Unable to listen for the Google sign-in redirect.")?;
    let port = listener
        .local_addr()
        .map_err(|_| "Unable to read OAuth callback port.")?
        .port();
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(150) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .ok();
                let mut bytes = [0u8; 8192];
                let length = match stream.read(&mut bytes) {
                    Ok(n) if n > 0 && n < 8192 => n,
                    _ => continue,
                };
                let line = match std::str::from_utf8(&bytes[..length]) {
                    Ok(text) => text.lines().next().unwrap_or(""),
                    Err(_) => continue,
                };
                let mut words = line.split_whitespace();
                if words.next() != Some("GET") {
                    respond(&mut stream, "405 Method Not Allowed", "Unsupported sign-in callback.");
                    continue;
                }
                let request_target = words.next().unwrap_or("");
                if !request_target.starts_with("/?") || request_target.len() > 4096 {
                    respond(&mut stream, "400 Bad Request", "Unexpected sign-in callback.");
                    continue;
                }
                let full = format!("http://127.0.0.1:{port}{request_target}");
                let callback = match Url::parse(&full) {
                    Ok(url) => url,
                    Err(_) => continue,
                };
                let params: std::collections::HashMap<_, _> =
                    callback.query_pairs().into_owned().collect();
                if params.get("state").map(String::as_str) != Some(expected_state.as_str()) {
                    respond(&mut stream, "403 Forbidden", "The sign-in session did not match.");
                    continue;
                }
                if params.contains_key("error") {
                    respond(&mut stream, "200 OK", "Google sign-in was not completed.");
                    return Err("Google sign-in was cancelled or declined.".to_string());
                }
                if let Some(code) = params.get("code").filter(|code| !code.is_empty() && code.len() < 2048) {
                    respond(
                        &mut stream,
                        "200 OK",
                        "Google sign-in accepted. Return to D25 Quantum Workspace.",
                    );
                    return Ok(code.clone());
                }
                respond(&mut stream, "400 Bad Request", "Missing authorization code.");
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(75));
            }
            Err(_) => return Err("Unable to receive Google sign-in callback.".into()),
        }
    }
    Err("Google sign-in timed out. Try again.".into())
}

fn respond(stream: &mut TcpStream, status: &str, text: &str) {
    let body = format!(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>D25 Google Sign-in</title><body style=\"background:#0b1524;color:#f0d399;font:18px system-ui;padding:45px\"><h2>{text}</h2><p>You may close this tab.</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[tauri::command]
pub(crate) async fn d25_google_oauth(
    client_id: String,
    client_secret: Option<String>,
) -> Result<String, String> {
    let prefix = client_id
        .strip_suffix(".apps.googleusercontent.com")
        .unwrap_or("");
    if prefix.is_empty()
        || prefix.len() > 120
        || !prefix.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("A valid Google Desktop OAuth client ID is required.".into());
    }
    if client_secret.as_ref().is_some_and(|s| s.len() > 256) {
        return Err("Invalid Google OAuth desktop client configuration.".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|_| "Unable to open a localhost OAuth callback.".to_string())?;
    let port = listener
        .local_addr()
        .map_err(|_| "Unable to determine the OAuth callback address.")?
        .port();
    let redirect = format!("http://127.0.0.1:{port}/");
    let verifier = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = Uuid::new_v4().simple().to_string();
    let mut url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
        .map_err(|_| "Google OAuth URL error.")?;
    url.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");
    webbrowser::open(url.as_str())
        .map_err(|_| "Unable to open the default browser for Google sign-in.")?;
    let code = tauri::async_runtime::spawn_blocking(move || {
        collect_oauth_code(listener, state)
    })
    .await
    .map_err(|_| "Google OAuth callback failed.")??;
    // Installed-app client credentials cannot be kept confidential. Optional
    // client_secret is supported only where the native OAuth client requires it.
    let mut params = vec![
        ("client_id", client_id.as_str()),
        ("code", code.as_str()),
        ("redirect_uri", redirect.as_str()),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier.as_str()),
    ];
    if let Some(secret) = client_secret.as_deref().filter(|s| !s.is_empty()) {
        params.push(("client_secret", secret));
    }
    let response = reqwest::Client::new()
        .post("https://oauth2.googleapis.com/token")
        .timeout(Duration::from_secs(20))
        .form(&params)
        .send()
        .await
        .map_err(|_| "Google token exchange failed. Check network connectivity.")?;
    if !response.status().is_success() {
        return Err("Google did not accept the desktop OAuth configuration.".into());
    }
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "Google token response was invalid.")?;
    let token = body.get("id_token").and_then(|v| v.as_str()).unwrap_or("");
    if token.is_empty() || token.len() > 8000 {
        return Err("Google did not return a valid identity token.".into());
    }
    Ok(token.to_string())
}
