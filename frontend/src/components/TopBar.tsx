import type { User } from "../types.ts";

interface Props {
  user: User | null;
  onRefresh: () => void;
  onLogout: () => void;
}

export function TopBar({ user, onRefresh, onLogout }: Props) {
  return (
    <header className="z-50 flex h-12 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-accent text-[13px] font-bold text-white">
          B
        </div>
        <span className="text-[14px] font-semibold tracking-[0.02em]">Botzin</span>
      </div>

      {user && (
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[12px] text-muted">
            {user.displayName} ({user.role})
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-[6px] border border-border px-3.5 py-1.5 text-[12px] font-medium text-muted transition-[background,color,border-color] duration-[120ms] hover:border-border-2 hover:bg-surface-3 hover:text-text"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 16h5v5"/>
            </svg>
            Atualizar
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-[6px] border border-border px-3.5 py-1.5 text-[12px] font-medium text-muted transition-[background,color,border-color] duration-[120ms] hover:border-border-2 hover:bg-surface-3 hover:text-text"
          >
            Sair
          </button>
        </div>
      )}
    </header>
  );
}
