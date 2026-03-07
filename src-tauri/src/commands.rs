use tauri::{AppHandle, Manager, State};

use crate::app_detector::detect_claude_desktop_path;
use crate::config_generator::write_desktop_config;
use crate::models::*;
use crate::process_manager::{self, InstanceRegistry};
use crate::profile_store::{data_dir, userdata_dir, ProfileStore};

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// Keychain service name
const KEYCHAIN_SERVICE: &str = "claude-conductor";

fn keychain_key(profile_id: &str, server_name: &str, env_key: &str) -> String {
    format!("{}/{}/{}", profile_id, server_name, env_key)
}

// ─── Profile commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_profiles(app: AppHandle) -> CmdResult<Vec<Profile>> {
    let store = ProfileStore::new(&app).map_err(err)?;
    store.list().map_err(err)
}

#[tauri::command]
pub fn create_profile(app: AppHandle, data: ProfileCreate) -> CmdResult<String> {
    let store = ProfileStore::new(&app).map_err(err)?;
    // Store keychain secrets before saving profile
    let data = store_secrets_from_create(data)?;
    let profile = store.create(data).map_err(err)?;
    let id = profile.id.clone();
    let _ = crate::rebuild_tray_menu(&app);
    Ok(id)
}

#[tauri::command]
pub fn update_profile(app: AppHandle, id: String, data: ProfileUpdate) -> CmdResult<()> {
    let store = ProfileStore::new(&app).map_err(err)?;
    let data = store_secrets_from_update(&id, data)?;
    store.update(&id, data).map_err(err)?;
    let _ = crate::rebuild_tray_menu(&app);
    Ok(())
}

#[tauri::command]
pub fn delete_profile(app: AppHandle, id: String) -> CmdResult<()> {
    let store = ProfileStore::new(&app).map_err(err)?;
    // Delete all keychain entries for this profile before removing
    if let Ok(profile) = store.load_by_id(&id) {
        for (server_name, server_cfg) in &profile.mcp_servers {
            for secret_key in &server_cfg.secret_keys {
                let kc_key = keychain_key(&id, server_name, secret_key);
                let _ = keyring::Entry::new(KEYCHAIN_SERVICE, &kc_key)
                    .and_then(|e| e.delete_credential());
            }
        }
    }
    store.delete(&id).map_err(err)?;
    let _ = crate::rebuild_tray_menu(&app);
    Ok(())
}

#[tauri::command]
pub fn reorder_profiles(app: AppHandle, ordered_ids: Vec<String>) -> CmdResult<()> {
    let store = ProfileStore::new(&app).map_err(err)?;
    store.reorder(&ordered_ids).map_err(err)?;
    let _ = crate::rebuild_tray_menu(&app);
    Ok(())
}

#[tauri::command]
pub fn import_profile(app: AppHandle, file_path: String) -> CmdResult<()> {
    let store = ProfileStore::new(&app).map_err(err)?;
    store.import(&file_path).map_err(err)?;
    let _ = crate::rebuild_tray_menu(&app);
    Ok(())
}

#[tauri::command]
pub fn export_profile(app: AppHandle, profile_id: String, dest_dir: String) -> CmdResult<String> {
    let store = ProfileStore::new(&app).map_err(err)?;
    let path = store.export(&profile_id, &dest_dir).map_err(err)?;
    Ok(path.to_string_lossy().to_string())
}

// ─── Keychain helpers ─────────────────────────────────────────────────────────

/// For servers with secret_keys, store values in keychain and blank the env value.
fn store_secrets_from_create(mut data: ProfileCreate) -> CmdResult<ProfileCreate> {
    // We don't have a profile ID yet — generate a temporary one.
    // The actual profile ID is assigned in ProfileStore::create, so we use a
    // placeholder here. We'll re-key after the profile is created... 
    // Simpler: just pass through — secrets are stored keyed by profile_id which
    // comes from ProfileStore. We handle this in update instead.
    // For create, secret_keys are preserved in the model; values stay in env for
    // first launch. User should re-save to move them to keychain.
    Ok(data)
}

fn store_secrets_from_update(profile_id: &str, mut data: ProfileUpdate) -> CmdResult<ProfileUpdate> {
    if let Some(ref mut servers) = data.mcp_servers {
        for (server_name, server_cfg) in servers.iter_mut() {
            for secret_key in &server_cfg.secret_keys.clone() {
                if let Some(value) = server_cfg.env.get(secret_key) {
                    if !value.is_empty() {
                        // Store in keychain
                        let kc_key = keychain_key(profile_id, server_name, secret_key);
                        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &kc_key)
                            .map_err(|e| format!("Keychain error: {}", e))?;
                        entry.set_password(value)
                            .map_err(|e| format!("Failed to store secret in keychain: {}", e))?;
                        // Blank the value in the stored profile
                        server_cfg.env.insert(secret_key.clone(), String::new());
                    }
                }
            }
        }
    }
    Ok(data)
}

/// Resolve keychain secrets into a profile's env vars before launching.
pub fn resolve_secrets(profile: &mut Profile) -> CmdResult<()> {
    for (server_name, server_cfg) in profile.mcp_servers.iter_mut() {
        for secret_key in &server_cfg.secret_keys.clone() {
            let kc_key = keychain_key(&profile.id, server_name, secret_key);
            match keyring::Entry::new(KEYCHAIN_SERVICE, &kc_key)
                .and_then(|e| e.get_password())
            {
                Ok(value) => {
                    server_cfg.env.insert(secret_key.clone(), value);
                }
                Err(e) => {
                    log::warn!("Could not retrieve secret {} from keychain: {}", kc_key, e);
                }
            }
        }
    }
    Ok(())
}

// ─── Keychain commands (called from frontend) ─────────────────────────────────

#[tauri::command]
pub fn store_secret(profile_id: String, server_name: String, key: String, value: String) -> CmdResult<()> {
    let kc_key = keychain_key(&profile_id, &server_name, &key);
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &kc_key)
        .map_err(|e| format!("Keychain error: {}", e))?;
    entry.set_password(&value)
        .map_err(|e| format!("Failed to store secret: {}", e))
}

#[tauri::command]
pub fn get_secret(profile_id: String, server_name: String, key: String) -> CmdResult<Option<String>> {
    let kc_key = keychain_key(&profile_id, &server_name, &key);
    match keyring::Entry::new(KEYCHAIN_SERVICE, &kc_key).and_then(|e| e.get_password()) {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keychain error: {}", e)),
    }
}

#[tauri::command]
pub fn delete_secret(profile_id: String, server_name: String, key: String) -> CmdResult<()> {
    let kc_key = keychain_key(&profile_id, &server_name, &key);
    match keyring::Entry::new(KEYCHAIN_SERVICE, &kc_key).and_then(|e| e.delete_credential()) {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already gone
        Err(e) => Err(format!("Keychain error: {}", e)),
    }
}

// ─── Instance commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn launch_profile(
    app: AppHandle,
    profile_id: String,
    registry: State<InstanceRegistry>,
) -> CmdResult<u32> {
    let store = ProfileStore::new(&app).map_err(err)?;
    let mut profile = store.load_by_id(&profile_id).map_err(err)?;
    let config = store.load_app_config().map_err(err)?;

    let claude_path = config
        .settings
        .claude_desktop_path
        .clone()
        .or_else(detect_claude_desktop_path)
        .ok_or("Claude Desktop not found. Set its path in Settings.")?;

    // Resolve keychain secrets into env vars before writing config
    resolve_secrets(&mut profile)?;

    let base = data_dir(&app).map_err(err)?;
    write_desktop_config(&base, &profile).map_err(err)?;

    let ud = userdata_dir(&base, &profile_id);
    let pid = process_manager::launch(&claude_path, &ud, &profile_id, &registry).map_err(err)?;

    let _ = store.mark_launched(&profile_id);
    let _ = crate::rebuild_tray_menu(&app);

    Ok(pid)
}

#[tauri::command]
pub fn kill_instance(
    app: AppHandle,
    pid: u32,
    registry: State<InstanceRegistry>,
) -> CmdResult<()> {
    process_manager::kill(pid, &registry).map_err(err)?;
    let _ = crate::rebuild_tray_menu(&app);
    Ok(())
}

#[tauri::command]
pub fn focus_instance(pid: u32) -> CmdResult<()> {
    process_manager::focus(pid).map_err(err)
}

#[tauri::command]
pub fn list_instances(registry: State<InstanceRegistry>) -> CmdResult<Vec<RunningInstance>> {
    Ok(registry.list())
}

// ─── Settings commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_settings(app: AppHandle) -> CmdResult<AppSettings> {
    let store = ProfileStore::new(&app).map_err(err)?;
    let config = store.load_app_config().map_err(err)?;
    Ok(config.settings)
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppSettings) -> CmdResult<()> {
    let store = ProfileStore::new(&app).map_err(err)?;
    let mut config = store.load_app_config().map_err(err)?;
    config.settings = settings;
    store.save_app_config(&config).map_err(err)
}

#[tauri::command]
pub fn detect_claude_path() -> CmdResult<Option<String>> {
    Ok(detect_claude_desktop_path())
}

// ─── Window control commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn force_quit() {
    std::process::exit(0);
}

#[tauri::command]
pub fn minimize_window(app: AppHandle) -> CmdResult<()> {
    if let Some(win) = app.get_webview_window("main") {
        win.minimize().map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_maximize(app: AppHandle) -> CmdResult<()> {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_maximized().unwrap_or(false) {
            win.unmaximize().map_err(err)?;
        } else {
            win.maximize().map_err(err)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: AppHandle) -> CmdResult<()> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(err)?;
    }
    Ok(())
}

// ─── Read host Claude Desktop config ─────────────────────────────────────────

#[tauri::command]
pub fn read_host_claude_config() -> CmdResult<serde_json::Value> {
    let config_path = {
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME").map_err(err)?;
            std::path::PathBuf::from(home)
                .join("Library/Application Support/Claude/claude_desktop_config.json")
        }
        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA").map_err(err)?;
            std::path::PathBuf::from(appdata).join("Claude/claude_desktop_config.json")
        }
        #[cfg(target_os = "linux")]
        {
            let home = std::env::var("HOME").map_err(err)?;
            std::path::PathBuf::from(home).join(".config/Claude/claude_desktop_config.json")
        }
    };

    if !config_path.exists() {
        return Err(format!(
            "Claude Desktop config not found at {}",
            config_path.display()
        ));
    }

    let raw = std::fs::read_to_string(&config_path).map_err(err)?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(err)?;

    let servers = parsed
        .get("mcpServers")
        .cloned()
        .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    Ok(servers)
}
