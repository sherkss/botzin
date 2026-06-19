import { StatusSection } from "../sections/StatusSection.tsx";
import type { AppState } from "../types.ts";

interface Props { state: AppState; statusMsg: string; onRefresh: () => void; }

export function ConfigPage({ state, statusMsg, onRefresh }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-semibold">Configuracao</h1>
            <p className="mt-0.5 text-[13px] text-muted">Snapshot completo do estado atual</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-2 rounded-[6px] border border-border px-4 py-2 text-[12px] font-medium text-muted transition-colors duration-[120ms] hover:border-border-2 hover:bg-surface-3 hover:text-text"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>
            </svg>
            Atualizar
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <StatusSection state={state} statusMsg={statusMsg} />
      </div>
    </div>
  );
}
