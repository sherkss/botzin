import { OpsSection } from "../sections/OpsSection.tsx";
import type { AppState } from "../types.ts";
import { PageHeader } from "../components/ui.tsx";

interface Props { state: AppState; onRefresh: () => void; }

export function OpsPage({ state, onRefresh }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader eyebrow="Operação" title="Operações" description="Monitore decisões ao vivo, atribuições de hunt, telemetria e regras de execução." />
      <div className="flex-1 overflow-y-auto">
        <OpsSection state={state} onRefresh={onRefresh} />
      </div>
    </div>
  );
}
