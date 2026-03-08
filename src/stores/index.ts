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
  deleteProfile: (id: string) => Promise<void>;
  reorderProfiles: (orderedIds: string[]) => Promise<void>;
  importProfileFromDialog: () => Promise<void>;
  exportProfileToDialog: (profileId: string) => Promise<void>;

  launchProfile: (profileId: string) => Promise<void>;
  killInstance: (pid: number) => Promise<void>;
  focusInstance: (pid: number) => Promise<void>;

  setActiveView: (view: ActiveView) => void;
  setModal: (modal: ModalState) => void;
  clearError: () => void;
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
      set({ error: String(e), isLoading: false });
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
    const id = await invoke<string>("create_profile", { data });
    await get().loadProfiles();
    return id;
  },

  updateProfile: async (id: string, data: ProfileUpdate) => {
    await invoke("update_profile", { id, data });
    await get().loadProfiles();
  },

  deleteProfile: async (id: string) => {
    await invoke("delete_profile", { id });
    await get().loadProfiles();
  },

  reorderProfiles: async (orderedIds: string[]) => {
    await invoke("reorder_profiles", { orderedIds });
    await get().loadProfiles();
  },

  importProfileFromDialog: async () => {
    const filePath = await open({
      title: "Import Profile",
      filters: [{ name: "Claude Conductor Profile", extensions: ["json"] }],
      multiple: false,
    });
    if (!filePath) return;
    await invoke("import_profile", { filePath: filePath as string });
    await get().loadProfiles();
  },

  exportProfileToDialog: async (profileId: string) => {
    const profile = get().profiles.find((p) => p.id === profileId);
    const defaultName = profile ? `${profile.name.replace(/[^a-z0-9]/gi, "_")}.json` : "profile.json";
    const filePath = await save({
      title: "Export Profile",
      defaultPath: defaultName,
      filters: [{ name: "Claude Conductor Profile", extensions: ["json"] }],
    });
    if (!filePath) return;
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    await invoke("export_profile", { profileId, destDir: dir });
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

    await invoke("kill_instance", { pid });
    await get().loadInstances();
  },

  focusInstance: async (pid: number) => {
    await invoke("focus_instance", { pid });
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
