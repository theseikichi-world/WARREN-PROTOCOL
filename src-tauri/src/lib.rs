use tauri_plugin_autostart::MacosLauncher;

#[tauri::command]
fn get_username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "AGENT".to_string())
        .to_uppercase()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .invoke_handler(tauri::generate_handler![get_username])
        .run(tauri::generate_context!())
        .expect("error while running Warren");
}
