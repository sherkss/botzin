import { LearningSection } from "../sections/LearningSection.tsx";
import type { AppState } from "../types.ts";

interface Props { state: AppState; onRefresh: () => void; }

export function LearningPage({ state, onRefresh }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-5">
        <h1 className="text-[18px] font-semibold">Aprendizado</h1>
        <p className="mt-0.5 text-[13px] text-muted">Metodos, fontes, sessoes e vinculos de ensino</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <LearningSection state={state} onRefresh={onRefresh} />
      </div>
    </div>
  );
}
