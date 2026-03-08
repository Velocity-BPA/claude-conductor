use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── MCP Server Config ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Keys in `env` whose values are stored in the system keychain.
    #[serde(default)]
    pub secret_keys: Vec<String>,
}

// ─── Profile ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub schema_version: u32,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub description: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_launched_at: Option<DateTime<Utc>>,
    pub sort_order: i32,
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

impl Profile {
    pub fn new(data: ProfileCreate, sort_order: i32) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            schema_version: 1,
            name: data.name,
            icon: data.icon.unwrap_or_else(|| "💻".to_string()),
            color: data.color.unwrap_or_else(|| "#f5a623".to_string()),
            description: data.description.unwrap_or_default(),
            created_at: now,
            updated_at: now,
            last_launched_at: None,
            sort_order,
            mcp_servers: data.mcp_servers.unwrap_or_default(),
        }
    }
}

// ─── Profile Index ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileIndexEntry {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i32,
}

impl From<&Profile> for ProfileIndexEntry {
    fn from(p: &Profile) -> Self {
        Self {
            id: p.id.clone(),
            name: p.name.clone(),
            icon: p.icon.clone(),
            color: p.color.clone(),
            sort_order: p.sort_order,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileIndex {
    pub version: u32,
    pub profiles: Vec<ProfileIndexEntry>,
}

// ─── Create / Update payloads ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileCreate {
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub description: Option<String>,
    pub mcp_servers: Option<HashMap<String, McpServerConfig>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileUpdate {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
    pub mcp_servers: Option<HashMap<String, McpServerConfig>>,
}

// ─── Running Instance ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningInstance {
    pub profile_id: String,
    pub pid: u32,
    pub launched_at: DateTime<Utc>,
    /// The --user-data-dir path passed to this Claude instance.
    /// Stored at launch so kill can reliably target all related processes.
    pub user_data_dir: String,
}

// ─── App Config ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub launch_at_login: bool,
    pub show_in_dock: bool,
    pub confirm_before_kill: bool,
    pub claude_desktop_path: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            launch_at_login: false,
            show_in_dock: false,
            confirm_before_kill: true,
            claude_desktop_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub schema_version: u32,
    pub settings: AppSettings,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            settings: AppSettings::default(),
        }
    }
}

// ─── Claude Desktop native config format ─────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDesktopConfig {
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

impl From<&Profile> for ClaudeDesktopConfig {
    fn from(p: &Profile) -> Self {
        Self {
            mcp_servers: p.mcp_servers.clone(),
        }
    }
}
