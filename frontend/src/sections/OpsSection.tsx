import { useEffect, useState, type FormEvent } from "react";
import { CollapsibleCard } from "../components/CollapsibleCard.tsx";
import { Field, GroupLabel, Input, Select, Textarea } from "../components/Field.tsx";
import { FormBody, useFormSubmit } from "../components/FormSection.tsx";
import { apiFetch, apiFetchBlob, apiPost } from "../api.ts";
import type { AppState, HuntTelemetry, LiveDecisionRecord, LiveDecisionSnapshot } from "../types.ts";

interface Props {
  state: AppState;
  onRefresh: () => void;
}

export function OpsSection({ state, onRefresh }: Props) {
  return (
    <section id="sec-ops" className="border-b border-border px-5 py-6">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Operacoes
      </h2>
      <LiveDecisionCard />
      <CharacterRunCard state={state} onRefresh={onRefresh} />
      <HuntTelemetryCard state={state} onRefresh={onRefresh} />
      <AssignmentCard state={state} onRefresh={onRefresh} />
      <HuntSkillRuleCard state={state} onRefresh={onRefresh} />
    </section>
  );
}

function CharacterRunCard({ state, onRefresh }: Props) {
  const running = state.characterRuns.filter((run) => run.status === "running");
  useEffect(() => {
    const timer = window.setInterval(() => void onRefresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [onRefresh]);

  return (
    <CollapsibleCard icon="C" iconKind="method" title="Coleta automática por char" wide>
      <p className="text-[12px] text-muted">
        Não precisa iniciar manualmente. Quando o agente recebe imagem em uma máquina com assignment ativo, ele abre a run e começa a coletar. Ao pausar ou desativar o assignment, a run é encerrada automaticamente.
      </p>

      {running.length > 0 && (
        <div className="mt-4 space-y-2">
          {running.map((run) => (
            <div key={run.id} className="flex flex-wrap items-center gap-3 rounded-[6px] border border-border bg-bg p-3 text-[12px]">
              <span className="font-semibold">Run #{run.id}</span>
              <span className="text-muted">Char {run.characterId} • Hunt {run.huntId} • {formatDecisionTime(run.startedAt)}</span>
              <span className="ml-auto text-icon-skill">coletando</span>
            </div>
          ))}
        </div>
      )}
      {running.length === 0 && <p className="mt-3 text-[12px] text-muted">Nenhuma run ativa neste momento.</p>}
    </CollapsibleCard>
  );
}

function HuntTelemetryCard({ state, onRefresh }: Props) {
  const [characterId, setCharacterId] = useState("");
  const [huntId, setHuntId] = useState("");
  const [xpRatePercent, setXpRatePercent] = useState("150");
  const [rawText, setRawText] = useState("");
  const [runId, setRunId] = useState("");
  const [message, setMessage] = useState("Cole os dados copiados do Hunting Session Analyser.");
  const [busy, setBusy] = useState(false);
  const selectedCharacterId = Number(characterId);
  const samples = state.huntTelemetry.filter((sample) => !selectedCharacterId || sample.characterId === selectedCharacterId);
  const totalProfit = samples.reduce((sum, sample) => sum + (sample.profit ?? 0), 0);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setMessage("Interpretando e salvando a sessão...");
    try {
      await apiPost("/api/hunt-telemetry/import-analyser", {
        characterId: Number(characterId),
        huntId: Number(huntId),
        xpRatePercent: Number(xpRatePercent),
        runId: runId ? Number(runId) : undefined,
        rawText
      });
      setRawText("");
      setMessage("Sessão coletada e vinculada ao personagem.");
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao importar a sessão.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CollapsibleCard icon="T" iconKind="method" title="Telemetria de hunt por char" wide>
      <form onSubmit={(event) => void submit(event)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Personagem">
            <Select value={characterId} onChange={(event) => setCharacterId(event.target.value)} required>
              <option value="">Selecionar...</option>
              {state.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
            </Select>
          </Field>
          <Field label="Hunt">
            <Select value={huntId} onChange={(event) => setHuntId(event.target.value)} required>
              <option value="">Selecionar...</option>
              {state.hunts.map((hunt) => <option key={hunt.id} value={hunt.id}>{hunt.name}</option>)}
            </Select>
          </Field>
          <Field label="Taxa de XP exibida">
            <Select value={xpRatePercent} onChange={(event) => setXpRatePercent(event.target.value)}>
              <option value="100">100% raw</option>
              <option value="150">150% stamina verde</option>
              <option value="225">225% stamina + boost</option>
              <option value="300">300%</option>
            </Select>
          </Field>
          <Field label="Execução ativa">
            <Select value={runId} onChange={(event) => setRunId(event.target.value)}>
              <option value="">Sem vínculo</option>
              {state.characterRuns.filter((run) => run.status === "running").map((run) => (
                <option key={run.id} value={run.id}>Run #{run.id}</option>
              ))}
            </Select>
          </Field>
          <Field label="Hunting Session Analyser" className="sm:col-span-3">
            <Textarea value={rawText} onChange={(event) => setRawText(event.target.value)} required rows={10} placeholder={SESSION_ANALYSER_EXAMPLE} />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" disabled={busy} className="rounded-[6px] bg-accent px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
            {busy ? "Coletando..." : "Importar sessão"}
          </button>
          <span className="text-[12px] text-muted">{message}</span>
        </div>
      </form>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DecisionMetric label="Sessões" value={samples.length} />
        <DecisionMetric label="Profit acumulado" value={formatGold(totalProfit)} />
        <DecisionMetric label="XP/h 150% mais recente" value={formatMetric(samples[0]?.xpPerHour)} />
        <DecisionMetric label="XP/h raw mais recente" value={formatMetric(samples[0]?.rawXpPerHour)} />
      </div>

      {samples.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="text-[10px] uppercase tracking-[0.05em] text-muted">
              <tr><th className="pb-2 pr-3">Char / Hunt</th><th className="pb-2 pr-3">Duração</th><th className="pb-2 pr-3">XP/h</th><th className="pb-2 pr-3">Raw XP/h</th><th className="pb-2 pr-3">Profit</th><th className="pb-2">Criaturas</th></tr>
            </thead>
            <tbody>{samples.slice(0, 30).map((sample) => <TelemetryRow key={sample.id} sample={sample} state={state} />)}</tbody>
          </table>
        </div>
      )}
    </CollapsibleCard>
  );
}

function TelemetryRow({ sample, state }: { sample: HuntTelemetry; state: AppState }) {
  const character = state.characters.find((item) => item.id === sample.characterId)?.name ?? sample.characterId;
  const hunt = state.hunts.find((item) => item.id === sample.huntId)?.name ?? sample.huntId;
  const creatures = parseCreatureCount(sample.creaturesJson);
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-3"><div>{character}</div><div className="text-[10px] text-muted">{hunt}</div></td>
      <td className="py-2 pr-3 text-muted">{formatDuration(sample.durationSeconds)}</td>
      <td className="py-2 pr-3">{formatMetric(sample.xpPerHour)} <span className="text-[10px] text-muted">({sample.xpRatePercent}%)</span></td>
      <td className="py-2 pr-3">{formatMetric(sample.rawXpPerHour)}</td>
      <td className={`py-2 pr-3 ${(sample.profit ?? 0) < 0 ? "text-icon-machine" : "text-icon-skill"}`}>{formatGold(sample.profit)}</td>
      <td className="py-2 text-muted">{creatures}</td>
    </tr>
  );
}

const SESSION_ANALYSER_EXAMPLE = `Session: 00:30h\nXP Gain: 150,000\nRaw XP Gain: 100,000\nXP/h: 300,000\nRaw XP/h: 200,000\nLoot: 80,000\nSupplies: 30,000\nBalance: 50,000\nKilled Monsters:\n120x Dragon`;

function formatMetric(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("pt-BR").format(value);
}

function formatGold(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${new Intl.NumberFormat("pt-BR").format(value)} gp`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseCreatureCount(value: string | null): string {
  if (!value) return "—";
  try {
    const creatures = JSON.parse(value) as Record<string, number>;
    const entries = Object.entries(creatures);
    return entries.length === 0 ? "—" : entries.map(([name, count]) => `${count}× ${name}`).join(", ");
  } catch {
    return "—";
  }
}

function LiveDecisionCard() {
  const [snapshot, setSnapshot] = useState<LiveDecisionSnapshot>({ active: false, lastSeenAt: null, records: [] });
  const [message, setMessage] = useState("Aguardando o monitor de decisões...");

  useEffect(() => {
    let disposed = false;
    const refresh = async (): Promise<void> => {
      try {
        const value = await apiFetch<LiveDecisionSnapshot>("/api/decisions/live?limit=30");
        if (!disposed) {
          setSnapshot(value);
          setMessage(value.records.length === 0
            ? "Inicie o agente com npm run dev para receber decisões."
            : value.active ? "Recebendo decisões em tempo real." : "O agente parou de enviar decisões.");
        }
      } catch (error) {
        if (!disposed) setMessage(error instanceof Error ? error.message : "Falha ao carregar decisões.");
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  const latest = snapshot.records[0];
  return (
    <CollapsibleCard icon="D" iconKind="rule" title="Decisões ao vivo" wide>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${snapshot.active ? "bg-icon-skill" : "bg-icon-machine"}`} />
        <span className="text-[13px] font-semibold">{snapshot.active ? "Agente online" : "Agente offline"}</span>
        <span className="text-[12px] text-muted">{message}</span>
        {snapshot.lastSeenAt && <span className="ml-auto text-[11px] text-muted">Último ciclo: {formatDecisionTime(snapshot.lastSeenAt)}</span>}
      </div>

      {latest && (
        <div className="mt-4 rounded-[6px] border border-border bg-bg p-4">
          <AnnotatedLivePreview record={latest} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted">Decisão atual</div>
              <div className="mt-1 text-[16px] font-semibold">{latest.decision}</div>
            </div>
            <div className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted">
              {latest.mode === "observe" ? "Somente observar" : "Sugestão — não executada"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
            <DecisionMetric label="Players" value={latest.entityCounts.player} />
            <DecisionMetric label="Criaturas" value={latest.entityCounts.creature} />
            <DecisionMetric label="NPCs" value={latest.entityCounts.npc} />
            <DecisionMetric label="Summons" value={latest.entityCounts["player-summon"]} />
            <DecisionMetric label="Desconhecidos" value={latest.entityCounts.unknown} />
            <DecisionMetric label="Confiança visual" value={latest.perceptionConfidence === null ? "—" : `${Math.round(latest.perceptionConfidence * 100)}%`} />
          </div>

          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted">Motivos</div>
            <ul className="mt-1 space-y-1 text-[12px] text-muted">
              {latest.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
              {latest.error && <li className="text-icon-machine">• Erro: {latest.error}</li>}
            </ul>
          </div>
        </div>
      )}

      {snapshot.records.length > 1 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="text-[10px] uppercase tracking-[0.05em] text-muted">
              <tr><th className="pb-2 pr-3">Horário</th><th className="pb-2 pr-3">Decisão</th><th className="pb-2 pr-3">Modo</th><th className="pb-2">Entidades</th></tr>
            </thead>
            <tbody>
              {snapshot.records.slice(1).map((record) => <DecisionHistoryRow key={record.id} record={record} />)}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleCard>
  );
}

function DecisionMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-[5px] border border-border p-2"><div className="font-semibold">{value}</div><div className="text-[10px] text-muted">{label}</div></div>;
}

function DecisionHistoryRow({ record }: { record: LiveDecisionRecord }) {
  const totalEntities = Object.values(record.entityCounts).reduce((sum, count) => sum + count, 0);
  return (
    <tr className="border-t border-border">
      <td className="py-2 pr-3 text-muted">{formatDecisionTime(record.observedAt)}</td>
      <td className="py-2 pr-3">{record.decision}</td>
      <td className="py-2 pr-3 text-muted">{record.mode}</td>
      <td className="py-2 text-muted">{totalEntities}</td>
    </tr>
  );
}

function formatDecisionTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("pt-BR");
}

function AssignmentCard({ state, onRefresh }: Props) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/assignments", onSuccess: onRefresh });
  const [statusMessage, setStatusMessage] = useState("");
  const changeStatus = async (id: number, status: "active" | "paused" | "disabled"): Promise<void> => {
    try {
      await apiPost(`/api/assignments/${id}/status`, { status });
      setStatusMessage(`Assignment #${id}: ${status}.`);
      await onRefresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Falha ao alterar assignment.");
    }
  };
  return (
    <CollapsibleCard icon="A" iconKind="assign" title="Atribuicao de hunt" wide>
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar atribuicao">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Maquina">
            <Select name="machineId" required>
              <option value="">Selecionar...</option>
              {state.machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Char">
            <Select name="characterId" required>
              <option value="">Selecionar...</option>
              {state.characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Hunt">
            <Select name="huntId" required>
              <option value="">Selecionar...</option>
              {state.hunts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status">
              <option value="planned">Planejada</option>
              <option value="active">Ativa</option>
              <option value="paused">Pausada</option>
              <option value="disabled">Desativada</option>
            </Select>
          </Field>
          <Field label="Prioridade"><Input name="priority" type="number" defaultValue="100" /></Field>
          <Field label="Parar abaixo de stamina (min)"><Input name="minStaminaMinutes" type="number" min="0" max="2520" defaultValue="2340" /></Field>
          <Field label="Configuração de refill JSON" className="sm:col-span-3">
            <Textarea name="refillConfigJson" rows={4} placeholder='{"capacityBelow":200,"supplies":{"ultimate mana potion":{"returnAt":300,"buyTo":1200}},"depositLoot":true}' />
          </Field>
          <Field label="Notas" className="sm:col-span-3"><Textarea name="notes" /></Field>
        </div>
      </FormBody>
      <div className="mt-4 space-y-2">
        {state.assignments.map((assignment) => {
          const character = state.characters.find((item) => item.id === assignment.characterId)?.name ?? assignment.characterId;
          const hunt = state.hunts.find((item) => item.id === assignment.huntId)?.name ?? assignment.huntId;
          return (
            <div key={assignment.id} className="flex flex-wrap items-center gap-2 rounded border border-border p-2 text-[12px]">
              <span className="font-semibold">{character} — {hunt}</span>
              <span className="text-muted">{assignment.status} • stamina mínima {formatStamina(assignment.minStaminaMinutes)}</span>
              <button type="button" onClick={() => void changeStatus(assignment.id, "active")} className="ml-auto rounded border border-border px-2 py-1">Ativar</button>
              <button type="button" onClick={() => void changeStatus(assignment.id, "paused")} className="rounded border border-border px-2 py-1">Pausar</button>
              <button type="button" onClick={() => void changeStatus(assignment.id, "disabled")} className="rounded border border-border px-2 py-1 text-icon-machine">Desativar</button>
            </div>
          );
        })}
      </div>
      {statusMessage && <p className="mt-2 text-[12px] text-muted">{statusMessage}</p>}
    </CollapsibleCard>
  );
}

function AnnotatedLivePreview({ record }: { record: LiveDecisionRecord }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const entities = record.entities ?? [];
  const frame = record.frame;

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    void apiFetchBlob(`/api/obs/preview?t=${encodeURIComponent(record.id)}`)
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
        setPreviewError("");
      })
      .catch((error) => {
        if (!disposed) setPreviewError(error instanceof Error ? error.message : "Preview do OBS indisponível.");
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record.id]);

  if (!frame || frame.width <= 0 || frame.height <= 0) return null;
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.06em] text-muted">
        <span>Visão anotada</span><span>{entities.length} detecções</span>
      </div>
      {imageUrl ? (
        <div className="relative overflow-hidden rounded-[6px] border border-border bg-black">
          <img src={imageUrl} alt="Tela do Tibia com detecções" className="block h-auto w-full" />
          {entities.map((entity) => {
            const color = entityColor(entity.kind);
            const left = clampPercent(entity.box.x / frame.width * 100);
            const top = clampPercent(entity.box.y / frame.height * 100);
            const width = Math.min(clampPercent(entity.box.width / frame.width * 100), 100 - left);
            const height = Math.min(clampPercent(entity.box.height / frame.height * 100), 100 - top);
            return (
              <div key={entity.id} className="pointer-events-none absolute border-2" style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, borderColor: color }}>
                <span className="absolute -top-5 left-[-2px] whitespace-nowrap rounded-sm px-1 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: color }}>
                  {entity.label ?? entity.kind} {Math.round(entity.confidence * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      ) : <div className="rounded border border-border p-3 text-[12px] text-muted">{previewError || "Carregando preview do OBS..."}</div>}
      <p className="mt-1 text-[10px] text-muted">As caixas usam as coordenadas do último frame analisado.</p>
    </div>
  );
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function entityColor(kind: string): string {
  if (kind === "player") return "#22c55e";
  if (kind === "creature") return "#ef4444";
  if (kind === "npc") return "#eab308";
  if (kind === "player-summon") return "#3b82f6";
  return "#a855f7";
}

function formatStamina(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

function HuntSkillRuleCard({ state, onRefresh }: Props) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/hunt-skill-rules", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="R" iconKind="rule" title="Regra de skill na hunt" wide>
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar regra">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Hunt">
            <Select name="huntId" required>
              <option value="">Selecionar...</option>
              {state.hunts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
          <Field label="Skill">
            <Select name="skillId" required>
              <option value="">Selecionar...</option>
              {state.skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade"><Input name="priority" type="number" defaultValue="100" /></Field>
        </div>
        <GroupLabel>Condicoes de mana</GroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minima %"><Input name="minManaPercent" type="number" min="0" max="100" /></Field>
          <Field label="Maxima %"><Input name="maxManaPercent" type="number" min="0" max="100" /></Field>
        </div>
        <GroupLabel>Condicoes de HP</GroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimo %"><Input name="minHpPercent" type="number" min="0" max="100" /></Field>
          <Field label="Maximo %"><Input name="maxHpPercent" type="number" min="0" max="100" /></Field>
        </div>
        <GroupLabel>Criaturas em tela</GroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimas"><Input name="minCreatures" type="number" min="0" /></Field>
          <Field label="Maximas"><Input name="maxCreatures" type="number" min="0" /></Field>
        </div>
        <Field label="Notas"><Textarea name="notes" /></Field>
      </FormBody>
    </CollapsibleCard>
  );
}
