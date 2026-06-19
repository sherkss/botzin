import { EntitiesSection } from "../sections/EntitiesSection.tsx";
import type { AppState } from "../types.ts";

interface Props { state: AppState; onRefresh: () => void; }

export function EntitiesPage({ state, onRefresh }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Entidades"
        description="Contas, chars, maquinas, hunts e skills"
      />
      <div className="flex-1 overflow-y-auto">
        <EntitiesSection state={state} onRefresh={onRefresh} />
      </div>
    </div>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-border px-6 py-5">
      <h1 className="text-[18px] font-semibold">{title}</h1>
      <p className="mt-0.5 text-[13px] text-muted">{description}</p>
    </div>
  );
}
