import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "@/stores";

export function SettingsView() {
  const { settings, loadSettings, setLaunchAtLogin, getLaunchAtLoginFromOS } = useStore();
  const [saving, setSaving] = useState(false);
  const [claudePath, setClaudePath] = useState(settings?.claudeDesktopPath ?? "");
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    // Sync launchAtLogin with actual OS state on mount
    getLaunchAtLoginFromOS();
  }, []);

  useEffect(() => {
    setClaudePath(settings?.claudeDesktopPath ?? "");
  }, [settings?.claudeDesktopPath]);

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

  const handleSavePath = async () => {
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

  const handleToggle = async (key: "confirmBeforeKill", value: boolean) => {
    await invoke("update_settings", {
      settings: { ...settings, [key]: value },
    });
    await loadSettings();
  };

  return (
    <div className="p-5 animate-fade-in max-w-lg">
      <div className="mb-5">
        <h1 className="font-display font-700 text-text-primary text-lg tracking-wide">
          Settings
        </h1>
      </div>

      <div className="space-y-4">

        {/* Behaviour toggles */}
        <section className="card p-4 space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Behaviour</h3>

          <ToggleRow
            label="Launch at login"
            description="Start Conductor automatically when you log in"
            checked={settings?.launchAtLogin ?? false}
            onChange={setLaunchAtLogin}
          />

          <div className="border-t border-bg-border" />

          <ToggleRow
            label="Confirm before killing"
            description="Show a confirmation dialog before killing a running instance"
            checked={settings?.confirmBeforeKill ?? true}
            onChange={(v) => handleToggle("confirmBeforeKill", v)}
          />
        </section>

        {/* Claude Desktop path */}
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
            <button onClick={handleSavePath} disabled={saving} className="btn-primary text-xs">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </section>

        {/* Data directory */}
        <section className="card p-4 space-y-2">
          <h3 className="text-sm font-medium text-text-primary">Data Directory</h3>
          <p className="text-xs text-text-muted">
            Profile configs and isolated user data are stored at:
          </p>
          <code className="block text-xs font-mono text-accent bg-bg-base rounded px-2.5 py-2 border border-bg-border">
            ~/Library/Application Support/ClaudeConductor/
          </code>
        </section>

        {/* About */}
        <section className="card p-4 space-y-2">
          <h3 className="text-sm font-medium text-text-primary">About</h3>
          <div className="text-xs text-text-muted space-y-1">
            <p>Claude Conductor{version ? ` v${version}` : ""}</p>
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

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-9 h-5 rounded-full transition-colors duration-200 relative ${
          checked ? "bg-accent" : "bg-bg-border"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
