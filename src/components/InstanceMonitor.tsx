import { useStore } from "@/stores";

export function InstanceMonitor() {
  const { profiles, instances, killInstance, focusInstance } = useStore();

  const enriched = instances.map((inst) => ({
    ...inst,
    profile: profiles.find((p) => p.id === inst.profileId),
  }));

  const formatUptime = (launchedAt: string): string => {
    const diff = Date.now() - new Date(launchedAt).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m`;
    return "just launched";
  };

  return (
    <div className="p-5 animate-fade-in">
      <div className="mb-5">
        <h1 className="font-display font-700 text-text-primary text-lg tracking-wide">
          Running Instances
        </h1>
        <p className="text-text-muted text-xs mt-0.5">
          {instances.length > 0
            ? `${instances.length} active instance${instances.length > 1 ? "s" : ""}`
            : "No active instances"}
        </p>
      </div>

      {instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="text-4xl opacity-20">◉</div>
          <p className="text-text-secondary text-sm">No instances running</p>
          <p className="text-text-muted text-xs">
            Launch a profile from the Profiles tab to get started
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {enriched.map((inst) => (
            <div key={inst.pid} className="card p-4 flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-[8px] flex items-center justify-center text-xl shrink-0"
                style={{
                  background: inst.profile ? `${inst.profile.color}18` : "rgba(255,255,255,0.05)",
                  boxShadow: inst.profile ? `0 0 0 1px ${inst.profile.color}30` : undefined,
                }}
              >
                {inst.profile?.icon ?? "❓"}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary text-sm truncate">
                    {inst.profile?.name ?? `Profile ${inst.profileId.slice(0, 8)}`}
                  </span>
                  <span className="badge-running shrink-0">
                    <span className="status-dot running" />
                    running
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted font-mono">
                  <span>PID {inst.pid}</span>
                  <span>·</span>
                  <span>{formatUptime(inst.launchedAt)}</span>
                  {inst.profile && (
                    <>
                      <span>·</span>
                      <span>{Object.keys(inst.profile.mcpServers).length} MCP servers</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => focusInstance(inst.pid)}
                  className="btn-ghost text-xs px-2.5 py-1.5"
                  title="Bring window to front"
                >
                  Focus
                </button>
                <button
                  onClick={() => killInstance(inst.pid)}
                  className="btn border border-status-error/30 text-status-error hover:bg-status-error/10 text-xs px-2.5 py-1.5 active:scale-95"
                  title="Kill this instance"
                >
                  Kill
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
