import { EntitiesSection } from "../sections/EntitiesSection.tsx";
import type { AppState } from "../types.ts";
import { PageHeader } from "../components/ui.tsx";

interface Props { state: AppState; onRefresh: () => void; }

export function EntitiesPage({ state, onRefresh }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader eyebrow="Cadastros"
        title="Entidades"
        description="Gerencie contas, personagens, máquinas, hunts e habilidades em uma estrutura centralizada."
      />
      <div className="flex-1 overflow-y-auto">
        <EntitiesSection state={state} onRefresh={onRefresh} />
      </div>
    </div>
  );
}
