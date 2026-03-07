import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "@/stores";

export function SettingsView() {
  const { settings, loadSettings } = useStore();
  const [saving, setSaving] = useState(false);
  const [claudePath, setClaudePath] = useState(settings?.claudeDesktopPath ?? "");
  const [detectMsg, setDetectMsg] = useState<string | null>(null);

  const handleDetect = async () => {
    try {
      const detected = await invoke<string | null>("detect_claude_path");
      if (detected) {
        setClaudePath(detected);
        setDetectMsg(`Found: ${detected}`);
      } else {
        setDetectMsg("Could not auto-detect. Please select manually.");
      }
    } catch {
      setDetectMsg("Detection failed.");
    }
  };

  const handleBrowse = async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      title: "Select Claude.app",
      filters: [{ name: "Application", extensions: ["app"] }],
    });
    if (typeof selected === "string") setClaudePath(selected);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke("update_settings", {
        settings: { ...settings, claudeDesktopPath: claudePath || null },
      });
      await loadSettings();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 animate-fade-in max-w-lg">
      <div className="mb-5">
        <h1 className="font-display font-700 text-text-primary text-lg tracking-wide">
          Settings
        </h1>
      </div>

      <div className="space-y-6">
        <section className="card p-4 space-y-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">Claude Desktop Location</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Path to Claude.app (macOS) or Claude.exe (Windows)
            </p>
          </div>

          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-xs"
              placeholder="/Applications/Claude.app"
              value={claudePath}
              onChange={(e) => setClaudePath(e.target.value)}
            />
            <button onClick={handleBrowse} className="btn-ghost text-xs shrink-0">
              Browse…
            </button>
          </div>

          {detectMsg && (
            <p className="text-xs text-text-secondary">{detectMsg}</p>
          )}

          <div className="flex gap-2">
            <button onClick={handleDetect} className="btn-ghost text-xs">
              Auto-detect
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </section>

        <section className="card p-4 space-y-2">
          <h3 className="text-sm font-medium text-text-primary">Data Directory</h3>
          <p className="text-xs text-text-muted">
            Profile configs and isolated user data are stored at:
          </p>
          <code className="block text-xs font-mono text-accent bg-bg-base rounded px-2.5 py-2 border border-bg-border">
            ~/Library/Application Support/ClaudeConductor/
          </code>
        </section>

        <section className="card p-4 space-y-2">
          <h3 className="text-sm font-medium text-text-primary">About</h3>
          <div className="text-xs text-text-muted space-y-1">
            <p>Claude Conductor v0.1.0</p>
            <p>
              Built by{" "}
              <a
                href="https://github.com/Velocity-BPA"
                className="text-accent hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Velocity BPA
              </a>
            </p>
            <p className="text-text-muted/60">MIT License</p>
          </div>
        </section>
      </div>
    </div>
  );
}
