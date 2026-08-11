import { StatusSection } from "../sections/StatusSection.tsx";
import type { AppState } from "../types.ts";
import { RefreshCw } from "lucide-react";
import { Button, PageHeader } from "../components/ui.tsx";

interface Props { state: AppState; statusMsg: string; onRefresh: () => void; }

export function ConfigPage({ state, statusMsg, onRefresh }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader eyebrow="Sistema" title="Configurações" description="Consulte o estado consolidado e a configuração atual dos módulos." actions={<Button onClick={onRefresh}><RefreshCw size={15} />Atualizar snapshot</Button>} />
      <div className="flex-1 overflow-y-auto">
        <StatusSection state={state} statusMsg={statusMsg} />
      </div>
    </div>
  );
}
