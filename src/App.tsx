import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "@/stores";
import { Sidebar } from "@/components/Sidebar";
import { ProfilesView } from "@/components/ProfilesView";
import { InstanceMonitor } from "@/components/InstanceMonitor";
import { SettingsView } from "@/components/SettingsView";
import { ProfileModal } from "@/components/ProfileModal";
import { Titlebar } from "@/components/Titlebar";
import { ErrorToast } from "@/components/ErrorToast";

export default function App() {
  const { activeView, loadProfiles, loadInstances, loadSettings } = useStore();

  useEffect(() => {
    loadProfiles();
    loadInstances();
    loadSettings();
  }, []);

  useEffect(() => {
    const interval = setInterval(loadInstances, 3000);
    return () => clearInterval(interval);
  }, [loadInstances]);

  useEffect(() => {
    const unlisten = listen<string>("tray:launch", (event) => {
      useStore.getState().launchProfile(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-bg-base">
          {activeView === "profiles" && <ProfilesView />}
          {activeView === "monitor" && <InstanceMonitor />}
          {activeView === "settings" && <SettingsView />}
        </main>
      </div>
      <ProfileModal />
      <ErrorToast />
    </div>
  );
}
