use anyhow::Result;
use std::path::PathBuf;

/// Try to find Claude Desktop automatically.
pub fn detect_claude_desktop_path() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let candidates = [
            "/Applications/Claude.app",
            "~/Applications/Claude.app",
        ];
        for candidate in &candidates {
            let p = if candidate.starts_with('~') {
                candidate.replacen('~', &std::env::var("HOME").unwrap_or_default(), 1)
            } else {
                candidate.to_string()
            };
            if std::path::Path::new(&p).exists() {
                return Some(p);
            }
        }
        None
    }

    #[cfg(target_os = "windows")]
    {
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let candidates = [
            format!("{}\\Programs\\Claude\\Claude.exe", local_app_data),
            format!("{}\\AnthropicPBC\\Claude\\Claude.exe", local_app_data),
        ];
        for candidate in &candidates {
            if std::path::Path::new(candidate).exists() {
                return Some(candidate.clone());
            }
        }
        None
    }

    #[cfg(target_os = "linux")]
    {
        let candidates = [
            "/usr/bin/claude-desktop",
            "/usr/local/bin/claude-desktop",
        ];
        for candidate in &candidates {
            if std::path::Path::new(candidate).exists() {
                return Some(candidate.to_string());
            }
        }
        None
    }
}

/// Build the OS-appropriate launch command for a Claude Desktop instance.
pub fn build_launch_command(
    claude_path: &str,
    user_data_dir: &PathBuf,
) -> Result<(String, Vec<String>)> {
    let ud = user_data_dir.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        Ok((
            "open".to_string(),
            vec![
                "-n".to_string(),
                "-a".to_string(),
                claude_path.to_string(),
                "--args".to_string(),
                format!("--user-data-dir={}", ud),
            ],
        ))
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok((
            claude_path.to_string(),
            vec![format!("--user-data-dir={}", ud)],
        ))
    }
}
