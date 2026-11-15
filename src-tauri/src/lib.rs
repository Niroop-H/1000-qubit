// D25 commercial shell deliberately exposes no native compute quota IPC.
// Paid access and execution quotas are verified by the trusted service.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to start D25 Quantum Workspace");
}
