// D25 local-quantum desktop. Only Google OAuth and external checkout helpers
// run natively; user quantum circuits are executed on the customer PC.
mod google_oauth;

#[tauri::command]
fn d25_open_checkout(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Invalid checkout address.")?;
    let host = parsed.host_str().unwrap_or("");
    if parsed.scheme() != "https" || !["rzp.io", "razorpay.com"].contains(&host)
        || parsed.username() != "" || parsed.password().is_some() || parsed.port().is_some() {
        return Err("Only verified Razorpay HTTPS checkout links can be opened.".into());
    }
    webbrowser::open(&url).map_err(|_| "Unable to open Razorpay in the system browser.".into())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![google_oauth::d25_google_oauth, d25_open_checkout])
        .run(tauri::generate_context!())
        .expect("failed to start D25 Quantum Workspace");
}
