use anyhow::{anyhow, Result};
use chrono::Utc;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use sysinfo::{Pid, System};

use crate::app_detector::build_launch_command;
use crate::models::RunningInstance;

// ─── Instance Registry ────────────────────────────────────────────────────────

pub struct InstanceRegistry {
    inner: Arc<Mutex<HashMap<u32, RunningInstance>>>,
}

impl InstanceRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn register(&self, instance: RunningInstance) {
        let mut map = self.inner.lock().unwrap();
        map.insert(instance.pid, instance);
    }

    pub fn unregister(&self, pid: u32) {
        let mut map = self.inner.lock().unwrap();
        map.remove(&pid);
    }

    pub fn list(&self) -> Vec<RunningInstance> {
        self.prune_dead();
        let map = self.inner.lock().unwrap();
        map.values().cloned().collect()
    }

    pub fn running_profile_ids(&self) -> Vec<String> {
        self.list().iter().map(|i| i.profile_id.clone()).collect()
    }

    fn prune_dead(&self) {
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let mut map = self.inner.lock().unwrap();
        map.retain(|&pid, _| sys.process(Pid::from_u32(pid)).is_some());
    }
}

// ─── Launch ───────────────────────────────────────────────────────────────────

pub fn launch(
    claude_path: &str,
    user_data_dir: &PathBuf,
    profile_id: &str,
    registry: &InstanceRegistry,
) -> Result<u32> {
    let (program, args) = build_launch_command(claude_path, user_data_dir)?;

    log::info!("Launching Claude Desktop: {} {:?}", program, args);

    #[cfg(target_os = "macos")]
    {
        let child = Command::new(&program)
            .args(&args)
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn process: {}", e))?;
        drop(child);
        std::thread::sleep(std::time::Duration::from_millis(1200));
        let pid = find_claude_pid_by_userdata(user_data_dir)?;
        let instance = RunningInstance {
            profile_id: profile_id.to_string(),
            pid,
            launched_at: Utc::now(),
        };
        registry.register(instance);
        Ok(pid)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let child = Command::new(&program)
            .args(&args)
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn process: {}", e))?;
        let pid = child.id();
        let instance = RunningInstance {
            profile_id: profile_id.to_string(),
            pid,
            launched_at: Utc::now(),
        };
        registry.register(instance);
        Ok(pid)
    }
}

// ─── Kill ─────────────────────────────────────────────────────────────────────

pub fn kill(pid: u32, registry: &InstanceRegistry) -> Result<()> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        process.kill();
        registry.unregister(pid);
        log::info!("Killed process PID {}", pid);
        Ok(())
    } else {
        registry.unregister(pid);
        Err(anyhow!("Process {} not found", pid))
    }
}

// ─── Focus ────────────────────────────────────────────────────────────────────

pub fn focus(pid: u32) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            r#"tell application "System Events"
                set frontmost of (first process whose unix id is {}) to true
            end tell"#,
            pid
        );
        Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| anyhow!("Failed to focus window: {}", e))?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        log::warn!("Window focus not yet implemented on this platform (PID {})", pid);
        Ok(())
    }
}

// ─── Helper: find Claude PID by userdata dir (macOS) ─────────────────────────

#[cfg(target_os = "macos")]
fn find_claude_pid_by_userdata(user_data_dir: &PathBuf) -> Result<u32> {
    let ud_str = user_data_dir.to_string_lossy().to_string();
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if !name.contains("claude") {
            continue;
        }
        let cmd: Vec<String> = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_string())
            .collect();
        if cmd.iter().any(|arg| arg.contains(&ud_str)) {
            return Ok(pid.as_u32());
        }
    }
    Err(anyhow!(
        "Could not find Claude process with --user-data-dir={}",
        ud_str
    ))
}
