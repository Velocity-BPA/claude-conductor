import { getCurrentWindow } from "@tauri-apps/api/window";

export function Titlebar() {
  const win = getCurrentWindow();

  return (
    <div
      className="drag-region flex items-center justify-between h-10 px-4 bg-bg-surface border-b border-bg-border shrink-0"
      style={{ minHeight: 40 }}
    >
      <div className="flex items-center gap-2 no-drag">
        <span className="text-accent font-display font-700 text-sm tracking-wide">
          CONDUCTOR
        </span>
        <span className="text-text-muted text-xs font-mono">v0.1</span>
      </div>

      <div className="no-drag flex items-center gap-1.5">
        <button
          onClick={() => win.minimize()}
          className="w-3 h-3 rounded-full bg-[#f6be00] hover:brightness-90 transition-all"
          title="Minimize"
        />
        <button
          onClick={() => win.hide()}
          className="w-3 h-3 rounded-full bg-[#00ca4e] hover:brightness-90 transition-all"
          title="Hide to tray"
        />
        <button
          onClick={() => win.close()}
          className="w-3 h-3 rounded-full bg-[#ff605c] hover:brightness-90 transition-all"
          title="Close"
        />
      </div>
    </div>
  );
}
