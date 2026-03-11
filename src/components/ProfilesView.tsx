import { useState, useRef } from "react";
import { useStore, selectRunningProfileIds } from "@/stores";
import { ProfileCard } from "./ProfileCard";
import type { Profile } from "@/types";

export function ProfilesView() {
  const { profiles, isLoading, setModal, importProfileFromDialog, reorderProfiles } = useStore();
  const instances = useStore((s) => s.instances);
  const runningIds = selectRunningProfileIds({ instances });

  const [search, setSearch] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const orderedRef = useRef<Profile[]>([]);

  if (isLoading && profiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Loading profiles…
      </div>
    );
  }

  const sorted = [...profiles].sort((a, b) => a.sortOrder - b.sortOrder);
  orderedRef.current = sorted;

  const filtered = search.trim()
    ? sorted.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase())
      )
    : sorted;

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDropIndex(index);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex === null || dropIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    const reordered = [...orderedRef.current];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setDragIndex(null);
    setDropIndex(null);
    await reorderProfiles(reordered.map((p) => p.id));
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  return (
    <div className="p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => importProfileFromDialog()}
            className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
            title="Import a profile from a .json file"
          >
            ⬆ Import
          </button>
          <button
            onClick={() => setModal({ type: "create" })}
            className="btn-primary"
          >
            <span className="text-base leading-none">+</span>
            New Profile
          </button>
        </div>
      </div>

      {/* Search */}
      {profiles.length > 3 && (
        <div className="mb-4">
          <input
            className="input w-full text-sm"
            placeholder="Search profiles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

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

      {filtered.length === 0 && search && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
          <p className="text-text-secondary text-sm">No profiles match "{search}"</p>
          <button
            onClick={() => setSearch("")}
            className="btn-ghost text-xs"
          >
            Clear search
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <div
          className="grid gap-2.5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {filtered.map((profile, index) => (
            <div
              key={profile.id}
              draggable={!search}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <ProfileCard
                profile={profile}
                isRunning={runningIds.has(profile.id)}
                isDragging={dragIndex === index}
                isDropTarget={dropIndex === index && dragIndex !== index}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
