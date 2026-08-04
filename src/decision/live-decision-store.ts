import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { PerceptionEvent } from "../coordination/perception-event.js";
import type { GameEntity, GameEntityKind } from "../core/game-entity.js";
import type { InputCommand } from "../core/input-command.js";

export interface LiveDecisionRecord {
  readonly id: string;
  readonly observedAt: string;
  readonly sourceComputerId: string;
  readonly strategy: string;
  readonly mode: "observe" | "suggest";
  readonly status: "observed" | "suggested" | "error";
  readonly decision: string;
  readonly reasons: readonly string[];
  readonly perceptionConfidence: number | null;
  readonly frame: { readonly id: string; readonly width: number; readonly height: number } | null;
  readonly entities: readonly GameEntity[];
  readonly entityCounts: Readonly<Record<GameEntityKind, number>>;
  readonly commands: readonly InputCommand[];
  readonly error: string | null;
}

export interface LiveDecisionSnapshot {
  readonly active: boolean;
  readonly lastSeenAt: string | null;
  readonly records: readonly LiveDecisionRecord[];
}

const EMPTY_COUNTS: Readonly<Record<GameEntityKind, number>> = {
  player: 0,
  creature: 0,
  npc: 0,
  "player-summon": 0,
  unknown: 0
};

export function decisionFrom(
  event: PerceptionEvent,
  strategy: string,
  commands: readonly InputCommand[]
): LiveDecisionRecord {
  const entityCounts = { ...EMPTY_COUNTS };
  for (const entity of event.entities) entityCounts[entity.kind] += 1;
  const confidence = event.entities.length > 0
    ? event.entities.reduce((sum, entity) => sum + entity.confidence, 0) / event.entities.length
    : null;
  const hasCommands = commands.length > 0;
  return {
    id: randomUUID(),
    observedAt: new Date().toISOString(),
    sourceComputerId: event.sourceComputerId,
    strategy,
    mode: hasCommands ? "suggest" : "observe",
    status: hasCommands ? "suggested" : "observed",
    decision: hasCommands ? commands.map((command) => command.type).join(", ") : "Nenhuma ação",
    reasons: hasCommands
      ? ["A estratégia produziu comandos candidatos.", "Execução automática não está conectada a este monitor."]
      : ["Estratégia passiva em modo de observação.", "Nenhum comando foi produzido neste ciclo."],
    perceptionConfidence: confidence,
    frame: event.frame,
    entities: event.entities,
    entityCounts,
    commands,
    error: null
  };
}

export function errorDecision(sourceComputerId: string, strategy: string, error: unknown): LiveDecisionRecord {
  return {
    id: randomUUID(),
    observedAt: new Date().toISOString(),
    sourceComputerId,
    strategy,
    mode: "observe",
    status: "error",
    decision: "Falha ao avaliar o frame",
    reasons: ["O ciclo foi interrompido antes de produzir uma decisão."],
    perceptionConfidence: null,
    frame: null,
    entities: [],
    entityCounts: { ...EMPTY_COUNTS },
    commands: [],
    error: error instanceof Error ? error.message : String(error)
  };
}

export class LiveDecisionStore {
  private writes = 0;

  constructor(
    private readonly path: string,
    private readonly retainedRecords = 1_000
  ) {}

  async append(record: LiveDecisionRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(record)}\n`, "utf8");
    this.writes += 1;
    if (this.writes % 100 === 0 || await this.isOversized()) await this.compact();
  }

  async listLatest(limit = 50): Promise<LiveDecisionRecord[]> {
    try {
      const lines = (await readFile(this.path, "utf8")).split(/\r?\n/).filter(Boolean);
      return lines.slice(-clampLimit(limit)).flatMap((line) => {
        try {
          return [JSON.parse(line) as LiveDecisionRecord];
        } catch {
          return [];
        }
      }).reverse();
    } catch {
      return [];
    }
  }

  async snapshot(limit: number, activeWindowMs: number): Promise<LiveDecisionSnapshot> {
    const records = await this.listLatest(limit);
    const lastSeenAt = records[0]?.observedAt ?? null;
    return {
      active: lastSeenAt !== null && Date.now() - Date.parse(lastSeenAt) <= activeWindowMs,
      lastSeenAt,
      records
    };
  }

  private async isOversized(): Promise<boolean> {
    try {
      return (await stat(this.path)).size > 5 * 1024 * 1024;
    } catch {
      return false;
    }
  }

  private async compact(): Promise<void> {
    const records = (await this.listLatest(this.retainedRecords)).reverse();
    const temporaryPath = `${this.path}.tmp`;
    await writeFile(temporaryPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
    await rename(temporaryPath, this.path);
  }
}

function clampLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 200)) : 50;
}
