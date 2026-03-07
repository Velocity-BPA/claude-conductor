use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::models::*;

pub fn data_dir(app: &AppHandle) -> Result<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .context("Could not resolve app data dir")?;
    let dir = if let Some(parent) = base.parent() {
        parent.join("ClaudeConductor")
    } else {
        base
    };
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn profile_dir(base: &PathBuf, profile_id: &str) -> PathBuf {
    base.join("profiles").join(profile_id)
}

pub fn userdata_dir(base: &PathBuf, profile_id: &str) -> PathBuf {
    profile_dir(base, profile_id).join("userdata")
}

// ─── ProfileStore ─────────────────────────────────────────────────────────────

pub struct ProfileStore {
    base: PathBuf,
}

impl ProfileStore {
    pub fn new(app: &AppHandle) -> Result<Self> {
        Ok(Self { base: data_dir(app)? })
    }

    pub fn load_index(&self) -> Result<ProfileIndex> {
        let path = self.base.join("profiles").join("index.json");
        if !path.exists() {
            return Ok(ProfileIndex { version: 1, profiles: vec![] });
        }
        let raw = fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&raw)?)
    }

    fn save_index(&self, index: &ProfileIndex) -> Result<()> {
        let dir = self.base.join("profiles");
        fs::create_dir_all(&dir)?;
        let path = dir.join("index.json");
        fs::write(path, serde_json::to_string_pretty(index)?)?;
        Ok(())
    }

    fn rebuild_index_from_profiles(&self) -> Result<()> {
        let profiles_dir = self.base.join("profiles");
        if !profiles_dir.exists() {
            return Ok(());
        }
        let mut entries: Vec<ProfileIndexEntry> = vec![];
        for entry in fs::read_dir(&profiles_dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() { continue; }
            let profile_json = entry.path().join("profile.json");
            if !profile_json.exists() { continue; }
            if let Ok(raw) = fs::read_to_string(&profile_json) {
                if let Ok(profile) = serde_json::from_str::<Profile>(&raw) {
                    entries.push(ProfileIndexEntry::from(&profile));
                }
            }
        }
        entries.sort_by_key(|e| e.sort_order);
        let index = ProfileIndex { version: 1, profiles: entries };
        self.save_index(&index)
    }

    pub fn list(&self) -> Result<Vec<Profile>> {
        let index = self.load_index()?;
        let mut profiles = Vec::with_capacity(index.profiles.len());
        for entry in &index.profiles {
            if let Ok(p) = self.load_by_id(&entry.id) {
                profiles.push(p);
            }
        }
        Ok(profiles)
    }

    pub fn load_by_id(&self, id: &str) -> Result<Profile> {
        let path = profile_dir(&self.base, id).join("profile.json");
        let raw = fs::read_to_string(&path).with_context(|| format!("Profile not found: {id}"))?;
        Ok(serde_json::from_str(&raw)?)
    }

    pub fn create(&self, data: ProfileCreate) -> Result<Profile> {
        let index = self.load_index()?;
        let sort_order = index.profiles.len() as i32;
        let profile = Profile::new(data, sort_order);
        self.save(&profile)?;
        self.rebuild_index_from_profiles()?;
        Ok(profile)
    }

    pub fn update(&self, id: &str, data: ProfileUpdate) -> Result<Profile> {
        let mut profile = self.load_by_id(id)?;
        if let Some(name) = data.name { profile.name = name; }
        if let Some(icon) = data.icon { profile.icon = icon; }
        if let Some(color) = data.color { profile.color = color; }
        if let Some(desc) = data.description { profile.description = desc; }
        if let Some(order) = data.sort_order { profile.sort_order = order; }
        if let Some(mcp) = data.mcp_servers { profile.mcp_servers = mcp; }
        profile.updated_at = chrono::Utc::now();
        self.save(&profile)?;
        self.rebuild_index_from_profiles()?;
        Ok(profile)
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let dir = profile_dir(&self.base, id);
        if dir.exists() { fs::remove_dir_all(dir)?; }
        self.rebuild_index_from_profiles()?;
        Ok(())
    }

    pub fn reorder(&self, ordered_ids: &[String]) -> Result<()> {
        for (i, id) in ordered_ids.iter().enumerate() {
            if let Ok(mut profile) = self.load_by_id(id) {
                profile.sort_order = i as i32;
                profile.updated_at = chrono::Utc::now();
                let _ = self.save(&profile);
            }
        }
        self.rebuild_index_from_profiles()?;
        Ok(())
    }

    pub fn mark_launched(&self, id: &str) -> Result<()> {
        if let Ok(mut profile) = self.load_by_id(id) {
            profile.last_launched_at = Some(chrono::Utc::now());
            let _ = self.save(&profile);
        }
        Ok(())
    }

    pub fn import(&self, file_path: &str) -> Result<Profile> {
        let raw = fs::read_to_string(file_path)?;
        let mut profile: Profile = serde_json::from_str(&raw)?;
        profile.id = uuid::Uuid::new_v4().to_string();
        profile.name = format!("{} (imported)", profile.name);
        let index = self.load_index()?;
        profile.sort_order = index.profiles.len() as i32;
        self.save(&profile)?;
        self.rebuild_index_from_profiles()?;
        Ok(profile)
    }

    pub fn export(&self, profile_id: &str, dest_dir: &str) -> Result<PathBuf> {
        let profile = self.load_by_id(profile_id)?;
        let dest = PathBuf::from(dest_dir)
            .join(format!("{}.conductor-profile.json", profile.name.replace(' ', "_")));
        fs::write(&dest, serde_json::to_string_pretty(&profile)?)?;
        Ok(dest)
    }

    fn save(&self, profile: &Profile) -> Result<()> {
        let dir = profile_dir(&self.base, &profile.id);
        fs::create_dir_all(&dir)?;
        let path = dir.join("profile.json");
        fs::write(path, serde_json::to_string_pretty(profile)?)?;
        Ok(())
    }

    pub fn load_app_config(&self) -> Result<AppConfig> {
        let path = self.base.join("conductor.json");
        if !path.exists() { return Ok(AppConfig::default()); }
        let raw = fs::read_to_string(path)?;
        Ok(serde_json::from_str(&raw)?)
    }

    pub fn save_app_config(&self, config: &AppConfig) -> Result<()> {
        let path = self.base.join("conductor.json");
        fs::write(path, serde_json::to_string_pretty(config)?)?;
        Ok(())
    }
}
