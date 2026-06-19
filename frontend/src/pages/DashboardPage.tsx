import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api.ts";
import type { AppState, Assignment } from "../types.ts";

interface Props {
  state: AppState;
  statusMsg: string;
  onRefresh: () => void;
}

interface StatCard {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}

export function DashboardPage({ state, statusMsg, onRefresh }: Props) {
  const activeAssignments = state.assignments.filter(a => a.status === "active");

  const stats: StatCard[] = [
    {
      label: "Contas",
      value: state.accounts.length,
      color: "text-icon-account",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    },
    {
      label: "Chars",
      value: state.characters.length,
      color: "text-icon-char",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
    {
      label: "Maquinas",
      value: state.machines.length,
      color: "text-icon-machine",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
    },
    {
      label: "Hunts",
      value: state.hunts.length,
      color: "text-icon-hunt",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>,
    },
    {
      label: "Skills",
      value: state.skills.length,
      color: "text-icon-skill",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    },
    {
      label: "Atribuicoes ativas",
      value: activeAssignments.length,
      color: "text-icon-assign",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    },
    {
      label: "Metodos de aprendizado",
      value: state.learningMethods.length,
      color: "text-icon-method",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
    },
    {
      label: "Fontes de ensino",
      value: state.learningSources.length,
      color: "text-icon-source",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-semibold">Dashboard</h1>
            <p className="mt-0.5 text-[13px] text-muted">{statusMsg || "Visao geral em tempo real"}</p>
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

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats grid */}
        <div>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Resumo</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="rounded-[10px] border border-border bg-surface p-4">
                <div className={`mb-2 ${s.color}`}>{s.icon}</div>
                <div className="text-[26px] font-bold leading-none">{s.value}</div>
                <div className="mt-1 text-[12px] text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Active assignments */}
        <div>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Atribuicoes ativas
          </h2>
          {activeAssignments.length === 0 ? (
            <div className="rounded-[10px] border border-border bg-surface px-4 py-8 text-center text-[13px] text-subtle">
              Nenhuma atribuicao ativa no momento.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Iniciar preview
            </>
          )}
        </button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
        {!enabled && !error && (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto mb-3 text-subtle" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10l4.553-2.276A1 1 0 0 1 21 8.723v6.554a1 1 0 0 1-1.447.894L15 14"/>
                <rect x="1" y="6" width="15" height="12" rx="2"/>
              </svg>
              <p className="text-[13px] text-muted">Clique em &ldquo;Iniciar preview&rdquo; para ver a tela do OBS</p>
              <p className="mt-1 text-[11px] text-subtle">Atualiza a cada 2 segundos via OBS WebSocket</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto mb-3 text-[#f85149]" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
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
