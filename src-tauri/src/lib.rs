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

// ─── Files — a Проводник inside Warren ────────────────────────────────────────
// Read-only browsing of the user's own machine, plus "open" which hands a
// file to its default program exactly like a double-click in Explorer.
// Every path the UI can act on came from one of these listings.

#[derive(serde::Serialize)]
struct FileEntry {
    name:   String,
    path:   String,
    is_dir: bool,
    size:   u64,
    ext:    String,
}

fn entry_of(path: &Path, name: String, is_dir: bool, size: u64) -> FileEntry {
    FileEntry {
        ext: if is_dir {
            String::new()
        } else {
            path.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        },
        name,
        path: path.to_string_lossy().into_owned(),
        is_dir,
        size,
    }
}

/// Drive roots that actually exist (C:\, D:\ …).
#[tauri::command]
fn list_drives() -> Vec<FileEntry> {
    let mut out = Vec::new();
    #[cfg(windows)]
    for letter in b'A'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        let p = PathBuf::from(&root);
        if p.exists() {
            out.push(entry_of(&p, root.clone(), true, 0));
        }
    }
    #[cfg(not(windows))]
    {
        let p = PathBuf::from("/");
        out.push(entry_of(&p, "/".into(), true, 0));
    }
    out
}

/// Desktop / Documents / Downloads / … — the places people actually keep things.
#[tauri::command]
fn quick_places() -> Vec<FileEntry> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    if home.is_empty() {
        return Vec::new();
    }
    let base = PathBuf::from(&home);
    let mut out = vec![entry_of(&base, "Home".into(), true, 0)];
    for name in ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"] {
        let p = base.join(name);
        if p.is_dir() {
            out.push(entry_of(&p, name.to_string(), true, 0));
        }
    }
    out
}

/// One directory, folders first. Hidden and system entries are skipped so the
/// view stays as calm as Explorer's default.
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err("Not a folder.".into());
    }
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    let mut out: Vec<FileEntry> = Vec::new();
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };

        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            const HIDDEN: u32 = 0x2;
            const SYSTEM: u32 = 0x4;
            if meta.file_attributes() & (HIDDEN | SYSTEM) != 0 {
                continue;
            }
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        out.push(entry_of(&entry.path(), name, meta.is_dir(), meta.len()));
    }

    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

/// Open a file or folder with its default program — the same thing a
/// double-click in Explorer does. Only ever called for an entry the user
/// clicked in a listing above.
#[tauri::command]
fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !Path::new(&path).exists() {
        return Err("That path no longer exists.".into());
    }
    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Real Windows icons for the given shortcuts, as base64 PNGs (same order as
/// the input; an empty string means "no icon, use the fallback"). Uses the
/// stock PowerShell + .NET pipeline so no extra crates are needed.
#[tauri::command]
fn app_icons(paths: Vec<String>) -> Vec<String> {
    let empty: Vec<String> = paths.iter().map(|_| String::new()).collect();
    if paths.is_empty() {
        return empty;
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        // Paths go in as a here-string block so quoting can't break the script.
        let joined = paths.join("\n");
        let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
$shell = New-Object -ComObject WScript.Shell
$input | ForEach-Object {
  $p = $_
  $out = ''
  try {
    $target = $p
    if ($p -like '*.lnk') {
      $t = $shell.CreateShortcut($p).TargetPath
      if ($t -and (Test-Path -LiteralPath $t)) { $target = $t }
    }
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($target)
    if ($icon) {
      $bmp = $icon.ToBitmap()
      $ms  = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $out = [Convert]::ToBase64String($ms.ToArray())
      $ms.Dispose(); $bmp.Dispose(); $icon.Dispose()
    }
  } catch { $out = '' }
  Write-Output $out
}
"#;

        let mut child = match std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            Ok(c) => c,
            Err(_) => return empty,
        };

        if let Some(stdin) = child.stdin.as_mut() {
            use std::io::Write;
            let _ = stdin.write_all(joined.as_bytes());
        }
        let Ok(out) = child.wait_with_output() else { return empty };

        let mut icons: Vec<String> = String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .collect();
        icons.resize(paths.len(), String::new());
        icons
    }
    #[cfg(not(windows))]
    {
        empty
    }
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
        .invoke_handler(tauri::generate_handler![
            get_username, list_apps, launch_app, running_processes,
            list_drives, quick_places, list_dir, open_path, app_icons,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Warren");
}
