export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-accent text-[11px] font-bold text-white">
            B
          </div>
          <span className="text-[12px] font-medium text-muted">Botzin</span>
          <span className="text-subtle text-[12px]">v0.1.0</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-subtle">Ambiente local</span>
          <span className="h-1 w-1 rounded-full bg-emerald-400" />
          <span className="text-[11px] text-muted">Sistema operacional</span>
        </div>
      </div>
    </footer>
  );
}
