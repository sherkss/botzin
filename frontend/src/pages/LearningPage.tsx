import { LearningSection } from "../sections/LearningSection.tsx";
import type { AppState } from "../types.ts";
import { PageHeader } from "../components/ui.tsx";

interface Props { state: AppState; onRefresh: () => void; }

export function LearningPage({ state, onRefresh }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader eyebrow="Inteligência" title="Aprendizado" description="Organize métodos, fontes, sessões e vínculos que alimentam a inteligência do sistema." />
      <div className="flex-1 overflow-y-auto">
        <LearningSection state={state} onRefresh={onRefresh} />
      </div>
    </div>
  );
}
