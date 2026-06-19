export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-accent text-[11px] font-bold text-white">
            B
          </div>
          <span className="text-[12px] font-medium text-muted">Botzin</span>
          <span className="text-subtle text-[12px]">v0.1.0</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-subtle">Painel de configuracao local</span>
          <span className="text-[11px] text-subtle">·</span>
          <span className="text-[11px] text-subtle">Tibia Bot</span>
          <span className="text-[11px] text-subtle">·</span>
          <span className="text-[11px] text-subtle select-all font-mono text-muted">localhost:4580</span>
        </div>
      </div>
    </footer>
  );
}
