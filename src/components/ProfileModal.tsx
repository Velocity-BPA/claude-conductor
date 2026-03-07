import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { clsx } from "clsx";
import { nanoid } from "nanoid";
import { useStore } from "@/stores";
import { PROFILE_ICONS, PROFILE_COLORS, type McpServerConfig } from "@/types";

export function ProfileModal() {
  const { modal, setModal, profiles, createProfile, updateProfile, deleteProfile } = useStore();

  if (modal.type === "none") return null;
  if (modal.type === "delete") return <DeleteConfirmModal />;

  const editingProfile =
    modal.type === "edit" ? profiles.find((p) => p.id === modal.profileId) : undefined;

  return (
    <ProfileFormModal
      key={modal.type === "edit" ? modal.profileId : "new"}
      editingId={modal.type === "edit" ? modal.profileId : undefined}
      initial={editingProfile}
      onClose={() => setModal({ type: "none" })}
      onSave={async (data) => {
        if (editingProfile) {
          await updateProfile(editingProfile.id, data);
        } else {
          await createProfile(data);
        }
        setModal({ type: "none" });
      }}
    />
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirmModal() {
  const { modal, setModal, profiles, deleteProfile } = useStore();
  if (modal.type !== "delete") return null;

  const profile = profiles.find((p) => p.id === modal.profileId);

  return (
    <Overlay onClose={() => setModal({ type: "none" })}>
      <div className="card w-[380px] p-6 flex flex-col gap-5 animate-slide-up">
        <div>
          <h2 className="font-display font-700 text-text-primary text-base">Delete profile?</h2>
          <p className="text-text-secondary text-sm mt-1">
            <strong className="text-text-primary">{profile?.name}</strong> will be permanently removed.
            Running instances won't be affected.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setModal({ type: "none" })}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              await deleteProfile(modal.profileId);
              setModal({ type: "none" });
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── MCP Draft helpers ────────────────────────────────────────────────────────

interface McpDraft {
  _id: string;
  name: string;
  command: string;
  args: string;
  env: string;
}

function toMcpDraft(name: string, cfg: McpServerConfig): McpDraft {
  return {
    _id: nanoid(6),
    name,
    command: cfg.command,
    args: cfg.args.join(", "),
    env: Object.entries(cfg.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  };
}

function fromMcpDraft(d: McpDraft): [string, McpServerConfig] | null {
  if (!d.name.trim() || !d.command.trim()) return null;
  const env: Record<string, string> = {};
  d.env.split("\n").forEach((line) => {
    const idx = line.indexOf("=");
    if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return [
    d.name.trim(),
    {
      command: d.command.trim(),
      args: d.args.split(",").map((a) => a.trim()).filter(Boolean),
      env,
    },
  ];
}

// ─── Profile Form Modal ───────────────────────────────────────────────────────

interface ProfileFormModalProps {
  editingId?: string;
  initial?: Partial<{
    name: string; icon: string; color: string; description: string;
    mcpServers: Record<string, McpServerConfig>;
  }>;
  onClose: () => void;
  onSave: (data: {
    name: string; icon: string; color: string; description: string;
    mcpServers: Record<string, McpServerConfig>;
  }) => Promise<void>;
}

type ModalView = "form" | "import-picker" | "import-error";

function ProfileFormModal({ initial, onClose, onSave }: ProfileFormModalProps) {
  const [name, setName]               = useState(initial?.name ?? "");
  const [icon, setIcon]               = useState(initial?.icon ?? "💻");
  const [color, setColor]             = useState(initial?.color ?? PROFILE_COLORS[0]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [mcpServers, setMcpServers]   = useState<McpDraft[]>(
    initial?.mcpServers
      ? Object.entries(initial.mcpServers).map(([k, v]) => toMcpDraft(k, v))
      : []
  );
  const [saving, setSaving] = useState(false);

  // Import state
  const [view, setView]                     = useState<ModalView>("form");
  const [importLoading, setImportLoading]   = useState(false);
  const [importError, setImportError]       = useState<string>("");
  const [importCandidates, setImportCandidates] = useState<Record<string, McpServerConfig>>({});
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());

  const handleImportFromClaude = async () => {
    setImportLoading(true);
    setImportError("");
    try {
      const raw = await invoke<unknown>("read_host_claude_config");

      // Validate the response is a non-null object
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Unexpected response format from Claude Desktop config.");
      }

      const servers = raw as Record<string, McpServerConfig>;

      if (Object.keys(servers).length === 0) {
        throw new Error("No MCP servers found in your Claude Desktop config.\n\nMake sure Claude Desktop is installed and you have at least one MCP server configured.");
      }

      const existing = new Set(mcpServers.map((s) => s.name));
      setImportCandidates(servers);
      setImportSelected(new Set(Object.keys(servers).filter((k) => !existing.has(k))));
      setView("import-picker");
    } catch (e: unknown) {
      let msg = "Unknown error";
      if (typeof e === "string") msg = e;
      else if (e instanceof Error) msg = e.message;
      else if (e && typeof e === "object" && "message" in e) msg = String((e as any).message);

      // Make common errors more human-friendly
      if (msg.includes("not found") || msg.includes("No such file")) {
        msg = "Claude Desktop config file not found.\n\nExpected location:\n~/Library/Application Support/Claude/claude_desktop_config.json\n\nMake sure Claude Desktop is installed.";
      } else if (msg.includes("permission") || msg.includes("Permission")) {
        msg = "Permission denied reading Claude Desktop config.\n\nTry granting Claude Conductor full disk access in System Settings → Privacy & Security.";
      } else if (msg.includes("JSON") || msg.includes("parse")) {
        msg = "Claude Desktop config file appears to be malformed JSON.\n\nYou can still add servers manually using '+ Add server'.";
      }

      setImportError(msg);
      setView("import-error");
    }
    setImportLoading(false);
  };

  const commitImport = () => {
    const toAdd = Object.entries(importCandidates)
      .filter(([k]) => importSelected.has(k))
      .map(([k, v]) => toMcpDraft(k, v));

    setMcpServers((prev) => {
      const existingNames = new Set(prev.map((s) => s.name));
      const replacing = toAdd.filter((d) => existingNames.has(d.name));
      const appending = toAdd.filter((d) => !existingNames.has(d.name));
      return [
        ...prev.map((s) => replacing.find((r) => r.name === s.name) ?? s),
        ...appending,
      ];
    });
    setView("form");
  };

  const addServer = () =>
    setMcpServers((prev) => [
      ...prev,
      { _id: nanoid(6), name: "", command: "npx", args: "", env: "" },
    ]);

  const removeServer = (id: string) =>
    setMcpServers((prev) => prev.filter((s) => s._id !== id));

  const updateServer = (id: string, field: keyof McpDraft, value: string) =>
    setMcpServers((prev) => prev.map((s) => (s._id === id ? { ...s, [field]: value } : s)));

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const servers: Record<string, McpServerConfig> = {};
    for (const draft of mcpServers) {
      const parsed = fromMcpDraft(draft);
      if (parsed) servers[parsed[0]] = parsed[1];
    }
    await onSave({ name: name.trim(), icon, color, description: description.trim(), mcpServers: servers });
    setSaving(false);
  };

  // ── Import Picker view ────────────────────────────────────────────────────
  if (view === "import-picker") {
    const keys = Object.keys(importCandidates);
    const existing = new Set(mcpServers.map((s) => s.name));
    return (
      <Overlay onClose={() => setView("form")}>
        <div
          className="card w-[460px] max-h-[80vh] flex flex-col animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border shrink-0">
            <div>
              <h3 className="font-display font-700 text-text-primary text-sm">
                Import from Claude Desktop
              </h3>
              <p className="text-text-muted text-xs mt-0.5">
                {keys.length} server{keys.length !== 1 ? "s" : ""} found — choose which to include
              </p>
            </div>
            <button
              onClick={() => setView("form")}
              className="btn-ghost w-7 h-7 flex items-center justify-center text-lg p-0"
            >×</button>
          </div>

          <div className="flex gap-3 px-5 pt-3 pb-1 shrink-0">
            <button
              onClick={() => setImportSelected(new Set(keys))}
              className="text-xs text-accent hover:underline"
            >Select all</button>
            <button
              onClick={() => setImportSelected(new Set())}
              className="text-xs text-text-muted hover:underline"
            >Deselect all</button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 pb-3 space-y-2 mt-1">
            {keys.map((key) => {
              const cfg = importCandidates[key];
              const isSelected = importSelected.has(key);
              const isExisting = existing.has(key);
              return (
                <button
                  key={key}
                  onClick={() => {
                    setImportSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key); else next.add(key);
                      return next;
                    });
                  }}
                  className={clsx(
                    "w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-[6px] border transition-all",
                    isSelected
                      ? "bg-accent/10 border-accent/30"
                      : "bg-bg-base border-bg-border hover:bg-bg-elevated"
                  )}
                >
                  <div className={clsx(
                    "mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center border text-xs transition-all",
                    isSelected ? "bg-accent border-accent text-bg-base" : "border-bg-border"
                  )}>
                    {isSelected && "✓"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{key}</span>
                      {isExisting && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">
                          will replace
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted font-mono truncate mt-0.5">
                      {cfg.command} {cfg.args.slice(0, 2).join(" ")}{cfg.args.length > 2 ? " …" : ""}
                    </div>
                    {Object.keys(cfg.env ?? {}).length > 0 && (
                      <div className="text-[11px] text-text-muted mt-0.5">
                        🔑 {Object.keys(cfg.env).join(", ")}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between px-5 py-4 border-t border-bg-border shrink-0">
            <span className="text-xs text-text-muted">
              {importSelected.size} of {keys.length} selected
            </span>
            <div className="flex gap-2">
              <button onClick={() => setView("form")} className="btn-ghost">Back</button>
              <button
                onClick={commitImport}
                disabled={importSelected.size === 0}
                className={clsx("btn-primary", importSelected.size === 0 && "opacity-50 cursor-not-allowed")}
              >
                Import {importSelected.size > 0
                  ? `${importSelected.size} server${importSelected.size !== 1 ? "s" : ""}`
                  : ""}
              </button>
            </div>
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Import Error view ─────────────────────────────────────────────────────
  if (view === "import-error") {
    return (
      <Overlay onClose={() => setView("form")}>
        <div
          className="card w-[420px] flex flex-col animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border">
            <h3 className="font-display font-700 text-text-primary text-sm">Import Failed</h3>
            <button
              onClick={() => setView("form")}
              className="btn-ghost w-7 h-7 flex items-center justify-center text-lg p-0"
            >×</button>
          </div>
          <div className="px-5 py-5 space-y-4">
            <div className="flex gap-3">
              <span className="text-2xl shrink-0">⚠️</span>
              <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">
                {importError}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-bg-border">
            <button onClick={() => setView("form")} className="btn-ghost">
              Back
            </button>
            <button
              onClick={() => { setView("form"); addServer(); }}
              className="btn-primary"
            >
              Add server manually
            </button>
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Main Form view ────────────────────────────────────────────────────────
  return (
    <Overlay onClose={onClose}>
      <div
        className="card w-[520px] max-h-[85vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border shrink-0">
          <h2 className="font-display font-700 text-text-primary text-base">
            {initial ? "Edit Profile" : "New Profile"}
          </h2>
          <button onClick={onClose} className="btn-ghost w-7 h-7 flex items-center justify-center text-lg p-0">
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
          {/* Icon + Name */}
          <div className="flex gap-3">
            <div className="shrink-0">
              <label className="label">Icon</label>
              <div className="grid grid-cols-4 gap-1 bg-bg-base border border-bg-border rounded-[6px] p-1.5 w-[98px]">
                {PROFILE_ICONS.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => setIcon(ic)}
                    className={clsx(
                      "w-8 h-8 flex items-center justify-center rounded text-base transition-all",
                      icon === ic ? "bg-accent/20 ring-1 ring-accent/40" : "hover:bg-bg-elevated"
                    )}
                  >{ic}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className="label">Name *</label>
                <input className="input" placeholder="e.g. Work — Coding" value={name}
                  onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" placeholder="Optional short description" value={description}
                  onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <label className="label">Accent Color</label>
            <div className="flex gap-1.5 flex-wrap">
              {PROFILE_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={clsx("w-6 h-6 rounded-full transition-all",
                    color === c ? "ring-2 ring-offset-2 ring-offset-bg-surface ring-white/40 scale-110" : "hover:scale-105")}
                  style={{ background: c }} title={c} />
              ))}
            </div>
          </div>

          {/* MCP Servers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">MCP Servers</label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleImportFromClaude}
                  disabled={importLoading}
                  className="btn-ghost text-xs px-2 py-1 flex items-center gap-1.5"
                  title="Read MCP servers from your current Claude Desktop config"
                >
                  {importLoading
                    ? <><span className="animate-spin">⟳</span><span>Reading…</span></>
                    : <><span>⬇</span><span>Import from Claude Desktop</span></>}
                </button>
                <span className="text-bg-border text-xs">|</span>
                <button onClick={addServer} className="btn-ghost text-xs px-2 py-1">
                  + Add server
                </button>
              </div>
            </div>

            {mcpServers.length === 0 && (
              <div className="text-xs text-text-muted py-4 text-center bg-bg-base border border-bg-border border-dashed rounded-[6px]">
                No MCP servers — Claude Desktop will launch without any tools
              </div>
            )}

            <div className="space-y-3">
              {mcpServers.map((srv) => (
                <McpServerRow
                  key={srv._id}
                  draft={srv}
                  onChange={(field, value) => updateServer(srv._id, field, value)}
                  onRemove={() => removeServer(srv._id)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-bg-border shrink-0">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className={clsx("btn-primary", (!name.trim() || saving) && "opacity-50 cursor-not-allowed")}
          >
            {saving ? "Saving…" : initial ? "Save Changes" : "Create Profile"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── MCP Server row ───────────────────────────────────────────────────────────

interface McpServerRowProps {
  draft: McpDraft;
  onChange: (field: keyof McpDraft, value: string) => void;
  onRemove: () => void;
}

function McpServerRow({ draft, onChange, onRemove }: McpServerRowProps) {
  const [expanded, setExpanded] = useState(!draft.name);

  return (
    <div className="bg-bg-base border border-bg-border rounded-[6px] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setExpanded((v) => !v)} className="flex-1 flex items-center gap-2 text-left">
          <span className="text-text-muted text-xs">{expanded ? "▾" : "▸"}</span>
          <span className={clsx("text-sm", draft.name ? "text-text-primary" : "text-text-muted italic")}>
            {draft.name || "unnamed server"}
          </span>
          {draft.command && (
            <span className="text-text-muted text-xs font-mono truncate">{draft.command}</span>
          )}
        </button>
        <button onClick={onRemove} className="text-text-muted hover:text-status-error text-lg leading-none">×</button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-bg-border pt-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="label">Server name *</label>
              <input className="input" placeholder="e.g. filesystem" value={draft.name}
                onChange={(e) => onChange("name", e.target.value)} />
            </div>
            <div>
              <label className="label">Command *</label>
              <input className="input" placeholder="e.g. npx" value={draft.command}
                onChange={(e) => onChange("command", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Arguments (comma-separated)</label>
            <input className="input font-mono text-xs"
              placeholder="-y, @modelcontextprotocol/server-filesystem, /Users/you/Desktop"
              value={draft.args} onChange={(e) => onChange("args", e.target.value)} />
          </div>
          <div>
            <label className="label">Environment variables (KEY=value, one per line)</label>
            <textarea className="input font-mono text-xs resize-none" rows={3}
              placeholder={"GITHUB_TOKEN=ghp_xxx\nAPI_KEY=sk-..."}
              value={draft.env} onChange={(e) => onChange("env", e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
