import { clsx } from "clsx";
import { useStore, selectInstanceForProfile } from "@/stores";
import type { Profile } from "@/types";

interface ProfileCardProps {
  profile: Profile;
  isRunning: boolean;
}

export function ProfileCard({ profile, isRunning }: ProfileCardProps) {
  const { launchProfile, killInstance, focusInstance, setModal, exportProfileToDialog } = useStore();
  const instance = useStore((s) => selectInstanceForProfile(s, profile.id));
  const isLaunching = useStore((s) => s.launchingProfiles.has(profile.id));
  const mcpCount = Object.keys(profile.mcpServers).length;

  // Disable launch if already running or in the process of launching
  const launchDisabled = isRunning || isLaunching;

  return (
    <div
      className={clsx(
        "card glow-on-hover p-4 flex items-center gap-4 transition-all duration-200 group",
        isRunning && "border-status-running/20"
      )}
    >
      <div
        className="w-10 h-10 rounded-[8px] flex items-center justify-center text-xl shrink-0 relative"
        style={{ background: `${profile.color}18`, boxShadow: `0 0 0 1px ${profile.color}30` }}
      >
        {profile.icon}
        <span
          className={clsx(
            "status-dot absolute -bottom-0.5 -right-0.5",
            isLaunching ? "launching" : isRunning ? "running" : "stopped"
          )}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary text-sm truncate">
            {profile.name}
          </span>
          {isLaunching && (
            <span className="badge-launching shrink-0">
              <span className="inline-block animate-spin text-[10px]">⟳</span>
              launching…
            </span>
          )}
          {isRunning && !isLaunching && (
            <span className="badge-running shrink-0">
              <span className="status-dot running" />
              running
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-0.5">
          {profile.description && (
            <span className="text-xs text-text-muted truncate">{profile.description}</span>
          )}
          <span className="text-xs text-text-muted shrink-0 font-mono">
            {mcpCount} MCP server{mcpCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={() => setModal({ type: "edit", profileId: profile.id })}
          className="btn-ghost text-xs px-2 py-1"
          title="Edit profile"
        >
          Edit
        </button>
        <button
          onClick={() => exportProfileToDialog(profile.id)}
          className="btn-ghost text-xs px-2 py-1"
          title="Export profile to file"
        >
          Export
        </button>
        <button
          onClick={() => setModal({ type: "delete", profileId: profile.id })}
          className="btn-ghost text-xs px-2 py-1 hover:text-status-error"
          title="Delete profile"
        >
          Delete
        </button>
      </div>

      {/* Primary action buttons */}
      <div className="shrink-0 flex items-center gap-1.5">
        {isRunning ? (
          <>
            <button
              onClick={() => instance && focusInstance(instance.pid)}
              className="btn-ghost text-xs px-2.5 py-1.5"
              title="Bring window to front"
            >
              Focus
            </button>
            <button
              onClick={() => instance && killInstance(instance.pid)}
              className="btn border border-status-error/30 text-status-error hover:bg-status-error/10 active:scale-95 text-xs px-3 py-1.5"
              title="Kill this instance"
            >
              Kill
            </button>
          </>
        ) : (
          <button
            onClick={() => !launchDisabled && launchProfile(profile.id)}
            disabled={launchDisabled}
            className={clsx(
              "btn border text-xs px-3 py-1.5 active:scale-95 transition-opacity",
              launchDisabled && "opacity-50 cursor-not-allowed"
            )}
            style={{
              borderColor: `${profile.color}40`,
              color: profile.color,
              background: `${profile.color}0d`,
            }}
            onMouseEnter={(e) => {
              if (!launchDisabled)
                (e.currentTarget as HTMLButtonElement).style.background = `${profile.color}20`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = `${profile.color}0d`;
            }}
            title={isLaunching ? "Launching…" : isRunning ? "Already running" : "Launch this profile"}
          >
            {isLaunching ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin inline-block">⟳</span>
                Launching…
              </span>
            ) : (
              "▶ Launch"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
