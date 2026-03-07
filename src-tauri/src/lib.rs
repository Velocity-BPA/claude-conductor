use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent,
};

mod app_detector;
mod commands;
mod config_generator;
mod models;
mod process_manager;
mod profile_store;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .manage(process_manager::InstanceRegistry::new())
        .invoke_handler(tauri::generate_handler![
            commands::list_profiles,
            commands::create_profile,
            commands::update_profile,
            commands::delete_profile,
            commands::reorder_profiles,
            commands::import_profile,
            commands::export_profile,
            commands::launch_profile,
            commands::kill_instance,
            commands::focus_instance,
            commands::list_instances,
            commands::get_settings,
            commands::update_settings,
            commands::detect_claude_path,
            commands::read_host_claude_config,
            commands::force_quit,
            commands::minimize_window,
            commands::toggle_maximize,
            commands::hide_window,
        ])
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { ref api, .. } = event {
                api.prevent_exit();
            }
        });
}

// ─── Tray setup ───────────────────────────────────────────────────────────────

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItemBuilder::with_id("show", "Open Conductor").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit Conductor").build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&separator)
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Claude Conductor")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "quit" => {
                std::process::exit(0);
            }
            id if id.starts_with("launch:") => {
                let profile_id = id.strip_prefix("launch:").unwrap_or("").to_string();
                let _ = app.emit("tray:launch", profile_id);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Rebuild the tray menu with current profile list.
pub fn rebuild_tray_menu(app: &AppHandle) -> anyhow::Result<()> {
    let store = profile_store::ProfileStore::new(app)?;
    let index = store.load_index()?;
    let registry = app.state::<process_manager::InstanceRegistry>();
    let running_ids = registry.running_profile_ids();

    let tray = app.tray_by_id("").or_else(|| app.tray_by_id("main"));

    if let Some(tray) = tray {
        let show_item = MenuItemBuilder::with_id("show", "Open Conductor").build(app)?;
        let quit_item = MenuItemBuilder::with_id("quit", "Quit Conductor").build(app)?;
        let sep = tauri::menu::PredefinedMenuItem::separator(app)?;

        let running_count = running_ids.len();
        let title = if running_count > 0 {
            format!("Conductor  [{} running]", running_count)
        } else {
            "Conductor".to_string()
        };
        let header = MenuItemBuilder::with_id("header", &title)
            .enabled(false)
            .build(app)?;

        let mut builder = MenuBuilder::new(app).item(&header).item(&sep);

        for entry in &index.profiles {
            let label = if running_ids.contains(&entry.id) {
                format!("{} {} ●", entry.icon, entry.name)
            } else {
                format!("{} {}", entry.icon, entry.name)
            };
            let item = MenuItemBuilder::with_id(format!("launch:{}", entry.id), &label)
                .build(app)?;
            builder = builder.item(&item);
        }

        if index.profiles.is_empty() {
            let empty = MenuItemBuilder::with_id("empty", "No profiles — click to add")
                .build(app)?;
            builder = builder.item(&empty);
        }

        let menu = builder
            .item(&sep)
            .item(&show_item)
            .item(&quit_item)
            .build()?;

        tray.set_menu(Some(menu))?;
    }

    Ok(())
}
