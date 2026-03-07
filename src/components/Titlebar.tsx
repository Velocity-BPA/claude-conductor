import { getCurrentWindow } from "@tauri-apps/api/window";

export function Titlebar() {
  const win = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-10 px-4 bg-bg-surface border-b border-bg-border shrink-0 select-none"
      style={{ minHeight: 40 }}
    >
      {/* Traffic light buttons — left side, macOS convention */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => win.close()}
          className="w-3 h-3 rounded-full bg-[#ff605c] hover:brightness-90 active:brightness-75 transition-all"
          title="Close"
        />
        <button
          onClick={() => win.minimize()}
          className="w-3 h-3 rounded-full bg-[#f6be00] hover:brightness-90 active:brightness-75 transition-all"
          title="Minimize"
        />
        <button
          onClick={() => win.hide()}
          className="w-3 h-3 rounded-full bg-[#00ca4e] hover:brightness-90 active:brightness-75 transition-all"
          title="Hide to tray"
        />
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

      {/* Right side spacer to balance the layout */}
      <div className="w-[72px]" data-tauri-drag-region />
    </div>
  );
}
