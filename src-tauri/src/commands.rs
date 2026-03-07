use tauri::{AppHandle, State};

use crate::app_detector::detect_claude_desktop_path;
use crate::config_generator::write_desktop_config;
use crate::models::*;
use crate::process_manager::{self, InstanceRegistry};
use crate::profile_store::{data_dir, userdata_dir, ProfileStore};

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
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
    let profile = store.create(data).map_err(err)?;
    let id = profile.id.clone();
    let _ = crate::rebuild_tray_menu(&app);
    Ok(id)
}

#[tauri::command]
pub fn update_profile(app: AppHandle, id: String, data: ProfileUpdate) -> CmdResult<()> {
    let store = ProfileStore::new(&app).map_err(err)?;
    store.update(&id, data).map_err(err)?;
    let _ = crate::rebuild_tray_menu(&app);
    Ok(())
}

#[tauri::command]
pub fn delete_profile(app: AppHandle, id: String) -> CmdResult<()> {
    let store = ProfileStore::new(&app).map_err(err)?;
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

// ─── Instance commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn launch_profile(
    app: AppHandle,
    profile_id: String,
    registry: State<InstanceRegistry>,
) -> CmdResult<u32> {
    let store = ProfileStore::new(&app).map_err(err)?;
    let profile = store.load_by_id(&profile_id).map_err(err)?;
    let config = store.load_app_config().map_err(err)?;

    let claude_path = config
        .settings
        .claude_desktop_path
        .clone()
        .or_else(detect_claude_desktop_path)
        .ok_or("Claude Desktop not found. Set its path in Settings.")?;

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

// ─── Read host Claude Desktop config ─────────────────────────────────────────

/// Reads the real Claude Desktop config from the host machine and returns
/// the mcpServers map so the frontend can present a checklist import UI.
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

    // Return only the mcpServers object (or empty object if absent)
    let servers = parsed
        .get("mcpServers")
        .cloned()
        .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    Ok(servers)
}
