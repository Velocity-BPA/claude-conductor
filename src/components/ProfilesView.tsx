import { useStore, selectRunningProfileIds } from "@/stores";
import { ProfileCard } from "./ProfileCard";

export function ProfilesView() {
  const { profiles, isLoading, setModal } = useStore();
  const instances = useStore((s) => s.instances);
  const runningIds = selectRunningProfileIds({ ...useStore.getState(), instances });

  if (isLoading && profiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Loading profiles…
      </div>
    );
  }

  return (
    <div className="p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-700 text-text-primary text-lg tracking-wide">
            Profiles
          </h1>
          <p className="text-text-muted text-xs mt-0.5">
            {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
            {runningIds.size > 0 && (
              <> · <span className="text-status-running">{runningIds.size} running</span></>
            )}
          </p>
        </div>

        <button
          onClick={() => setModal({ type: "create" })}
          className="btn-primary"
        >
          <span className="text-base leading-none">+</span>
          New Profile
        </button>
      </div>

      {profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="text-4xl opacity-30">⊞</div>
          <p className="text-text-secondary text-sm">No profiles yet</p>
          <p className="text-text-muted text-xs max-w-[220px]">
            Create your first profile to launch Claude Desktop with a custom MCP configuration
          </p>
          <button
            onClick={() => setModal({ type: "create" })}
            className="btn-primary mt-2"
          >
            Create your first profile
          </button>
        </div>
      )}

      {profiles.length > 0 && (
        <div className="grid gap-2.5">
          {[...profiles]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                isRunning={runningIds.has(profile.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
