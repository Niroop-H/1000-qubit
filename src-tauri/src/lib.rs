mod quota;

pub fn run() {
    tauri::Builder::default()
        .manage(quota::QuotaStore::default())
        .invoke_handler(tauri::generate_handler![
            quota::d25_quota_status,
            quota::d25_quota_reserve
        ])
        .run(tauri::generate_context!())
        .expect("failed to start D25 Quantum Workspace");
}
