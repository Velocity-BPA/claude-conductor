use anyhow::Result;
use std::fs;
use std::path::PathBuf;

use crate::models::{ClaudeDesktopConfig, Profile};
use crate::profile_store::userdata_dir;

/// Write claude_desktop_config.json into the profile's userdata directory.
/// Called every time a profile is launched so the config is always fresh.
pub fn write_desktop_config(base: &PathBuf, profile: &Profile) -> Result<PathBuf> {
    let ud = userdata_dir(base, &profile.id);
    fs::create_dir_all(&ud)?;

    let config = ClaudeDesktopConfig::from(profile);
    let json = serde_json::to_string_pretty(&config)?;
    let config_path = ud.join("claude_desktop_config.json");
    fs::write(&config_path, json)?;

    log::debug!(
        "Wrote claude_desktop_config.json for profile '{}' at {}",
        profile.name,
        config_path.display()
    );

    Ok(config_path)
}
