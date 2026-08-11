import { useEffect, useRef, useState } from "react";
import { Activity, BookOpen, Bot, CircleAlert, Database, Monitor, Play, RefreshCw, Route, Sparkles, UsersRound, Video } from "lucide-react";
import { apiFetch } from "../api.ts";
import type { AppState, Assignment } from "../types.ts";
import { Badge, Button, EmptyState, PageHeader, SectionHeader } from "../components/ui.tsx";

interface Props {
  state: AppState;
  statusMsg: string;
  onRefresh: () => void;
}

interface StatCard {
  label: string;
  value: number;
  color: string;
  icon: React.ElementType;
}

export function DashboardPage({ state, statusMsg, onRefresh }: Props) {
  const activeAssignments = state.assignments.filter(a => a.status === "active");

  const stats: StatCard[] = [
    {
      label: "Contas",
      value: state.accounts.length,
      color: "text-icon-account",
      icon: UsersRound,
    },
    {
      label: "Chars",
      value: state.characters.length,
      color: "text-icon-char",
      icon: Bot,
    },
    {
      label: "Maquinas",
      value: state.machines.length,
      color: "text-icon-machine",
      icon: Monitor,
    },
    {
      label: "Hunts",
      value: state.hunts.length,
      color: "text-icon-hunt",
      icon: Route,
    },
    {
      label: "Skills",
      value: state.skills.length,
      color: "text-icon-skill",
      icon: Sparkles,
    },
    {
      label: "Atribuicoes ativas",
      value: activeAssignments.length,
      color: "text-icon-assign",
      icon: Activity,
    },
    {
      label: "Metodos de aprendizado",
      value: state.learningMethods.length,
      color: "text-icon-method",
      icon: BookOpen,
    },
    {
      label: "Fontes de ensino",
      value: state.learningSources.length,
      color: "text-icon-source",
      icon: Database,
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader eyebrow="Visão geral" title="Dashboard operacional" description={statusMsg || "Acompanhe a saúde, capacidade e atividade do sistema em tempo real."} actions={<Button onClick={onRefresh}><RefreshCw size={15} />Atualizar dados</Button>} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats grid */}
        <div className="dashboard-overview">
          <div className="primary-kpi">
            <div className="primary-kpi__top"><span>Operações ativas</span><Badge tone={activeAssignments.length ? "success" : "neutral"}>{activeAssignments.length ? "Em execução" : "Aguardando"}</Badge></div>
            <strong>{activeAssignments.length}</strong><p>de {state.assignments.length} atribuições configuradas</p>
            <div className="progress-track"><span style={{ width: `${state.assignments.length && activeAssignments.length ? Math.max(6, activeAssignments.length / state.assignments.length * 100) : 0}%` }} /></div>
          </div>
          <div className="compact-stats">
            {stats.filter(s => s.label !== "Atribuicoes ativas").map(s => { const Icon = s.icon; return <div key={s.label} className="compact-stat"><span className={s.color}><Icon size={17} /></span><div><strong>{s.value}</strong><small>{s.label}</small></div></div>; })}
          </div>
        </div>

        {/* Active assignments */}
        <div>
          <SectionHeader title="Atribuições ativas" description="Execuções prioritárias e seus recursos vinculados" />
          {activeAssignments.length === 0 ? (
            <EmptyState title="Nenhuma atribuição ativa" description="Ative uma atribuição em Operações para começar a acompanhar sua execução aqui." />
          ) : (
            <div className="overflow-x-auto rounded-[12px] border border-border bg-surface">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Char</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Hunt</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Maquina</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Prioridade</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAssignments.map(a => (
                    <AssignmentRow key={a.id} assignment={a} state={state} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* OBS Preview */}
        <ObsPreviewPanel />
      </div>
    </div>
  );
}

function AssignmentRow({ assignment, state }: { assignment: Assignment; state: AppState }) {
  const char = state.characters.find(c => c.id === assignment.characterId);
  const hunt = state.hunts.find(h => h.id === assignment.huntId);
  const machine = state.machines.find(m => m.id === assignment.machineId);

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors">
      <td className="px-4 py-3">
        <span className="font-medium">{char?.name ?? assignment.characterId}</span>
        {char?.vocation && <span className="ml-2 text-muted">{char.vocation}</span>}
      </td>
      <td className="px-4 py-3 text-muted">{hunt?.name ?? assignment.huntId}</td>
      <td className="px-4 py-3 text-muted">{machine?.name ?? assignment.machineId}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[11px] font-medium">
          {assignment.priority ?? 100}
        </span>
      </td>
    </tr>
  );
}

function ObsPreviewPanel() {
  const [enabled, setEnabled] = useState(false);
  const [src, setSrc] = useState("");
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startPreview() {
    setEnabled(true);
    setError(false);
    setSrc(`/api/obs/preview?t=${Date.now()}`);
  }

  function stopPreview() {
    setEnabled(false);
    setSrc("");
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  useEffect(() => {
    if (!enabled) return;
    intervalRef.current = setInterval(() => {
      setSrc(`/api/obs/preview?t=${Date.now()}`);
    }, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [enabled]);

  async function handleImageError() {
    // Check if OBS is really unavailable
    try {
      await apiFetch("/api/obs/preview");
    } catch {
      setError(true);
      stopPreview();
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Preview OBS — Hunt ao vivo
        </h2>
        <button
          type="button"
          onClick={enabled ? stopPreview : startPreview}
          className={`flex items-center gap-2 rounded-[6px] border px-3 py-1.5 text-[12px] font-medium transition-colors duration-[120ms] ${
            enabled
              ? "border-[#f8514933] bg-[#f8514910] text-[#f85149] hover:bg-[#f8514920]"
              : "border-border bg-surface text-muted hover:bg-surface-3 hover:text-text"
          }`}
        >
          {enabled ? (
            <>
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#f85149]" />
              Parar preview
            </>
          ) : (
            <>
              <Play size={13} />
              Iniciar preview
            </>
          )}
        </button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
        {!enabled && !error && (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <Video className="mx-auto mb-3 text-subtle" size={40} strokeWidth={1.25} />
              <p className="text-[13px] text-muted">Clique em &ldquo;Iniciar preview&rdquo; para ver a tela do OBS</p>
              <p className="mt-1 text-[11px] text-subtle">Atualiza a cada 2 segundos via OBS WebSocket</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <CircleAlert className="mx-auto mb-3 text-[#f87171]" size={36} strokeWidth={1.5} />
              <p className="text-[13px] text-muted">OBS nao disponivel</p>
              <p className="mt-1 text-[11px] text-subtle">Verifique se o OBS esta aberto e o WebSocket configurado</p>
              <button
                type="button"
                onClick={startPreview}
                className="mt-3 rounded-[6px] border border-border px-3 py-1.5 text-[12px] text-muted hover:bg-surface-3 hover:text-text transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {enabled && src && !error && (
          <div className="relative">
            <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3fb950]" />
              AO VIVO
            </div>
            <img
              src={src}
              alt="Preview OBS"
              onError={handleImageError}
              className="w-full rounded-[10px] object-contain"
              style={{ maxHeight: "480px", background: "#0d1117" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
