import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
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

  loadProfiles: () => Promise<void>;
  loadInstances: () => Promise<void>;
  loadSettings: () => Promise<void>;
  createProfile: (data: ProfileCreate) => Promise<string>;
  updateProfile: (id: string, data: ProfileUpdate) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  reorderProfiles: (orderedIds: string[]) => Promise<void>;
  importProfile: (filePath: string) => Promise<void>;
  exportProfile: (profileId: string, destDir: string) => Promise<void>;

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

  importProfile: async (filePath: string) => {
    await invoke("import_profile", { filePath });
    await get().loadProfiles();
  },

  exportProfile: async (profileId: string, destDir: string) => {
    await invoke("export_profile", { profileId, destDir });
  },

  launchProfile: async (profileId: string) => {
    set({ error: null });
    try {
      await invoke("launch_profile", { profileId });
      setTimeout(() => get().loadInstances(), 800);
    } catch (e) {
      set({ error: `Failed to launch: ${String(e)}` });
    }
  },

  killInstance: async (pid: number) => {
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

export const selectRunningProfileIds = (store: ProfileStore): Set<string> =>
  new Set(store.instances.map((i) => i.profileId));

export const selectInstanceForProfile = (
  store: ProfileStore,
  profileId: string
): RunningInstance | undefined =>
  store.instances.find((i) => i.profileId === profileId);
