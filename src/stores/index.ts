import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import type {
  Profile,
  RunningInstance,
  AppSettings,
  ProfileCreate,
  ProfileUpdate,
  ActiveView,
  ModalState,
} from "@/types";

interface ProfileStore {
  profiles: Profile[];
  instances: RunningInstance[];
  settings: AppSettings | null;
  activeView: ActiveView;
  modal: ModalState;
  isLoading: boolean;
  error: string | null;
  launchingProfiles: Set<string>;

  loadProfiles: () => Promise<void>;
  loadInstances: () => Promise<void>;
  loadSettings: () => Promise<void>;
  createProfile: (data: ProfileCreate) => Promise<string>;
  updateProfile: (id: string, data: ProfileUpdate) => Promise<void>;
  duplicateProfile: (id: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  reorderProfiles: (orderedIds: string[]) => Promise<void>;
  importProfileFromDialog: () => Promise<void>;
  exportProfileToDialog: (profileId: string) => Promise<void>;

  launchProfile: (profileId: string) => Promise<void>;
  killInstance: (pid: number) => Promise<void>;
  focusInstance: (pid: number) => Promise<void>;

  setLaunchAtLogin: (enabled: boolean) => Promise<void>;
  getLaunchAtLoginFromOS: () => Promise<boolean>;

  setActiveView: (view: ActiveView) => void;
  setModal: (modal: ModalState) => void;
  clearError: () => void;
}

// Wrap every invoke in a consistent error reporter
async function attempt<T>(
  set: (s: Partial<{ error: string | null }>) => void,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    set({ error: `${label}: ${String(e)}` });
    throw e;
  }
}

export const useStore = create<ProfileStore>((set, get) => ({
  profiles: [],
  instances: [],
  settings: null,
  activeView: "profiles",
  modal: { type: "none" },
  isLoading: false,
  error: null,
  launchingProfiles: new Set(),

  loadProfiles: async () => {
    set({ isLoading: true, error: null });
    try {
      const profiles = await invoke<Profile[]>("list_profiles");
      set({ profiles, isLoading: false });
    } catch (e) {
      set({ error: `Failed to load profiles: ${String(e)}`, isLoading: false });
    }
  },

  loadInstances: async () => {
    try {
      const instances = await invoke<RunningInstance[]>("list_instances");
      set({ instances });
    } catch (e) {
      console.error("Failed to load instances:", e);
    }
  },

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>("get_settings");
      set({ settings });
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  },

  createProfile: async (data: ProfileCreate): Promise<string> => {
    const id = await attempt(set, "Failed to create profile", () =>
      invoke<string>("create_profile", { data })
    );
    await get().loadProfiles();
    return id;
  },

  updateProfile: async (id: string, data: ProfileUpdate) => {
    await attempt(set, "Failed to update profile", () =>
      invoke("update_profile", { id, data })
    );
    await get().loadProfiles();
  },

  duplicateProfile: async (id: string) => {
    await attempt(set, "Failed to duplicate profile", () =>
      invoke("duplicate_profile", { id })
    );
    await get().loadProfiles();
  },

  deleteProfile: async (id: string) => {
    await attempt(set, "Failed to delete profile", () =>
      invoke("delete_profile", { id })
    );
    await get().loadProfiles();
  },

  reorderProfiles: async (orderedIds: string[]) => {
    await attempt(set, "Failed to reorder profiles", () =>
      invoke("reorder_profiles", { orderedIds })
    );
    await get().loadProfiles();
  },

  importProfileFromDialog: async () => {
    const filePath = await open({
      title: "Import Profile",
      filters: [{ name: "Claude Conductor Profile", extensions: ["json"] }],
      multiple: false,
    });
    if (!filePath) return;
    await attempt(set, "Failed to import profile", () =>
      invoke("import_profile", { filePath: filePath as string })
    );
    await get().loadProfiles();
  },

  exportProfileToDialog: async (profileId: string) => {
    const profile = get().profiles.find((p) => p.id === profileId);
    const defaultName = profile
      ? `${profile.name.replace(/[^a-z0-9]/gi, "_")}.json`
      : "profile.json";
    const filePath = await save({
      title: "Export Profile",
      defaultPath: defaultName,
      filters: [{ name: "Claude Conductor Profile", extensions: ["json"] }],
    });
    if (!filePath) return;
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    await attempt(set, "Failed to export profile", () =>
      invoke("export_profile", { profileId, destDir: dir })
    );
  },

  launchProfile: async (profileId: string) => {
    set((s) => ({
      error: null,
      launchingProfiles: new Set([...s.launchingProfiles, profileId]),
    }));
    try {
      await invoke("launch_profile", { profileId });
      setTimeout(() => get().loadInstances(), 800);
    } catch (e) {
      set({ error: `Failed to launch: ${String(e)}` });
    } finally {
      set((s) => {
        const next = new Set(s.launchingProfiles);
        next.delete(profileId);
        return { launchingProfiles: next };
      });
    }
  },

  killInstance: async (pid: number) => {
    const { settings, instances, profiles } = get();

    if (settings?.confirmBeforeKill) {
      const instance = instances.find((i) => i.pid === pid);
      const profile = profiles.find((p) => p.id === instance?.profileId);
      const name = profile?.name ?? "this instance";
      const ok = await confirm(`Kill "${name}"?`, {
        title: "Kill Instance",
        kind: "warning",
        okLabel: "Kill",
        cancelLabel: "Cancel",
      });
      if (!ok) return;
    }

    await attempt(set, "Failed to kill instance", () =>
      invoke("kill_instance", { pid })
    );
    await get().loadInstances();
  },

  focusInstance: async (pid: number) => {
    await attempt(set, "Failed to focus instance", () =>
      invoke("focus_instance", { pid })
    );
  },

  setLaunchAtLogin: async (enabled: boolean) => {
    await attempt(set, "Failed to set launch at login", () =>
      invoke("set_launch_at_login", { enabled })
    );
    // Sync the stored setting to match
    await attempt(set, "Failed to update settings", () =>
      invoke("update_settings", {
        settings: { ...get().settings, launchAtLogin: enabled },
      })
    );
    await get().loadSettings();
  },

  getLaunchAtLoginFromOS: async (): Promise<boolean> => {
    try {
      const enabled = await invoke<boolean>("get_launch_at_login");
      // Sync stored setting if it drifted from OS state
      const current = get().settings;
      if (current && current.launchAtLogin !== enabled) {
        await invoke("update_settings", {
          settings: { ...current, launchAtLogin: enabled },
        });
        await get().loadSettings();
      }
      return enabled;
    } catch (e) {
      console.error("Failed to get launch at login state:", e);
      return get().settings?.launchAtLogin ?? false;
    }
  },

  setActiveView: (view) => set({ activeView: view }),
  setModal: (modal) => set({ modal }),
  clearError: () => set({ error: null }),
}));

export const selectRunningProfileIds = (store: { instances: RunningInstance[] }): Set<string> =>
  new Set(store.instances.map((i) => i.profileId));

export const selectInstanceForProfile = (
  store: { instances: RunningInstance[] },
  profileId: string
): RunningInstance | undefined =>
  store.instances.find((i) => i.profileId === profileId);
