use std::path::{Path, PathBuf};
use tauri_plugin_autostart::MacosLauncher;

#[tauri::command]
fn get_username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "AGENT".to_string())
        .to_uppercase()
}

// ─── Big Screen mode — installed-app launcher ─────────────────────────────────
// Read-only scan of the Start Menu shortcut folders (the same .lnk files the
// real Start menu lists). Launching goes through the standard shell "open",
// exactly like a double-click — no elevation, no system modification.

#[derive(serde::Serialize)]
struct AppEntry {
    name: String,
    path: String,
}

fn start_menu_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        roots.push(PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Ok(programdata) = std::env::var("ProgramData") {
        roots.push(PathBuf::from(programdata).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    roots
}

/// Noise that clutters a launcher but nobody launches on purpose.
fn is_junk(name_lower: &str) -> bool {
    ["uninstall", "readme", "help", "documentation", "website", "report a bug", "license"]
        .iter()
        .any(|junk| name_lower.contains(junk))
}

fn walk_lnk(dir: &Path, depth: u8, out: &mut Vec<AppEntry>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_lnk(&path, depth + 1, out);
        } else if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"))
        {
            let name = path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            if name.is_empty() || is_junk(&name.to_lowercase()) {
                continue;
            }
            out.push(AppEntry {
                name,
                path: path.to_string_lossy().into_owned(),
            });
        }
    }
}

#[tauri::command]
fn list_apps() -> Vec<AppEntry> {
    let mut apps = Vec::new();
    for root in start_menu_roots() {
        walk_lnk(&root, 0, &mut apps);
    }
    // Dedupe by name (user-level Start Menu wins over the machine-level one)
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    apps
}

/// Names (lower-case, no ".exe") of processes running right now, so the
/// launcher can show what's already open. Read-only: shells out to the stock
/// `tasklist` utility with no console window — no extra dependency, and
/// nothing about other processes leaves the machine.
#[tauri::command]
fn running_processes() -> Vec<String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let Ok(out) = std::process::Command::new("tasklist")
            .args(["/fo", "csv", "/nh"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        else {
            return Vec::new();
        };

        // Rows look like: "chrome.exe","1234","Console","1","250,000 K"
        let mut names: Vec<String> = String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter_map(|line| line.trim().strip_prefix('"'))
            .filter_map(|rest| rest.split('"').next())
            .map(|name| {
                name.trim_end_matches(".exe")
                    .trim_end_matches(".EXE")
                    .to_lowercase()
            })
            .filter(|n| !n.is_empty())
            .collect();
        names.sort();
        names.dedup();
        names
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// Launch a Start Menu shortcut. Refuses anything that is not a .lnk inside
/// the scanned Start Menu folders, so the frontend can never run arbitrary paths.
#[tauri::command]
fn launch_app(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let p = Path::new(&path);
    let is_lnk = p
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"));
    let inside_start_menu = start_menu_roots().iter().any(|root| {
        match (std::fs::canonicalize(p), std::fs::canonicalize(root)) {
            (Ok(cp), Ok(cr)) => cp.starts_with(&cr),
            _ => false,
        }
    });
    if !is_lnk || !inside_start_menu {
        return Err("Refusing to launch a path outside the Start Menu.".into());
    }

    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .invoke_handler(tauri::generate_handler![get_username, list_apps, launch_app, running_processes])
        .run(tauri::generate_context!())
        .expect("error while running Warren");
}
