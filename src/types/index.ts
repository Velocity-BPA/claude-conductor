// ─── Profile ────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  secretKeys?: string[];
}

export interface Profile {
  id: string;
  schemaVersion: number;
  name: string;
  icon: string;
  color: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  lastLaunchedAt: string | null;
  sortOrder: number;
  mcpServers: Record<string, McpServerConfig>;
}

export type ProfileCreate = Pick<Profile, "name" | "icon" | "color" | "description"> & {
  mcpServers?: Record<string, McpServerConfig>;
};

export type ProfileUpdate = Partial<
  Pick<Profile, "name" | "icon" | "color" | "description" | "mcpServers" | "sortOrder">
>;

// ─── ProfileIndex ────────────────────────────────────────────────────────────

export interface ProfileIndexEntry {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export interface ProfileIndex {
  version: number;
  profiles: ProfileIndexEntry[];
}

// ─── Running Instance ────────────────────────────────────────────────────────

export interface RunningInstance {
  profileId: string;
  pid: number;
  launchedAt: string;
}

// ─── App Config ──────────────────────────────────────────────────────────────

export interface AppSettings {
  launchAtLogin: boolean;
  showInDock: boolean;
  confirmBeforeKill: boolean;
  claudeDesktopPath: string | null;
}

export interface AppConfig {
  schemaVersion: number;
  settings: AppSettings;
}

// ─── UI State ────────────────────────────────────────────────────────────────

export type ActiveView = "profiles" | "monitor" | "settings";

export type ModalState =
  | { type: "none" }
  | { type: "create" }
  | { type: "edit"; profileId: string }
  | { type: "delete"; profileId: string }
  | { type: "mcpEditor"; profileId: string };

// ─── Constants ───────────────────────────────────────────────────────────────

export const PROFILE_ICONS = [
  "💻", "🛠️", "📊", "🏠", "🎨", "🔬", "📝", "🌐",
  "🚀", "🎯", "🔑", "📦", "🧪", "🤖", "🎵", "⚡",
] as const;

export const PROFILE_COLORS = [
  "#f5a623",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#f97316",
  "#ec4899",
] as const;
