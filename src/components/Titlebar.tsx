import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { clsx } from "clsx";

export function Titlebar() {
  const win = getCurrentWindow();
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  const handleQuit = () => setShowQuitConfirm(true);
  const handleMinimize = () => win.minimize();
  const handleHide = () => win.hide();

  const confirmQuit = async () => {
    await exit(0);
  };

  return (
    <>
      <div
        data-tauri-drag-region
        className="flex items-center justify-between h-10 px-4 bg-bg-surface border-b border-bg-border shrink-0 select-none"
        style={{ minHeight: 40 }}
      >
        {/* Traffic light buttons — left side, macOS convention */}
        <div className="flex items-center gap-1.5">
          {/* Red — Quit */}
          <button
            onClick={handleQuit}
            className="group w-3 h-3 rounded-full bg-[#ff605c] hover:brightness-90 active:brightness-75 transition-all flex items-center justify-center"
            title="Quit"
          >
            <span className="hidden group-hover:block text-[8px] text-[#4d0000] font-bold leading-none">✕</span>
          </button>
          {/* Yellow — Minimize */}
          <button
            onClick={handleMinimize}
            className="group w-3 h-3 rounded-full bg-[#f6be00] hover:brightness-90 active:brightness-75 transition-all flex items-center justify-center"
            title="Minimize"
          >
            <span className="hidden group-hover:block text-[8px] text-[#4d3800] font-bold leading-none">−</span>
          </button>
          {/* Green — Hide to tray */}
          <button
            onClick={handleHide}
            className="group w-3 h-3 rounded-full bg-[#00ca4e] hover:brightness-90 active:brightness-75 transition-all flex items-center justify-center"
            title="Hide to tray"
          >
            <span className="hidden group-hover:block text-[8px] text-[#003d18] font-bold leading-none">+</span>
          </button>
        </div>

        {/* Title — centered */}
        <div
          data-tauri-drag-region
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none"
        >
          <span className="text-accent font-display font-700 text-sm tracking-wide">
            CONDUCTOR
          </span>
          <span className="text-text-muted text-xs font-mono">v0.1</span>
        </div>

        {/* Right spacer */}
        <div className="w-[72px]" data-tauri-drag-region />
      </div>

      {/* Quit confirmation dialog */}
      {showQuitConfirm && (
        <QuitConfirmDialog
          onConfirm={confirmQuit}
          onCancel={() => setShowQuitConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Quit Confirm Dialog ──────────────────────────────────────────────────────

function QuitConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="card w-[340px] p-6 flex flex-col gap-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-display font-700 text-text-primary text-base">Quit Conductor?</h2>
          <p className="text-text-secondary text-sm mt-1.5 leading-relaxed">
            Any running Claude Desktop instances will continue running. You can reopen Conductor from the menu bar icon.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            className="btn-ghost"
            onClick={onCancel}
            autoFocus
          >
            Cancel
          </button>
          <button
            className={clsx("btn-primary", "bg-[#ff605c] hover:bg-[#e5504e] border-[#ff605c]")}
            onClick={onConfirm}
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}
