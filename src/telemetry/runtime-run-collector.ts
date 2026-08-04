import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BotCharacterRun, BotCharacterRunSample } from "../core/bot-configuration.js";
import type { LiveDecisionRecord } from "../decision/live-decision-store.js";
import type { PerceptionResult } from "../perception/perception-pipeline.js";
import { evaluateHuntOperation, policyFromRunSnapshot } from "../decision/hunt-operation-policy.js";

export interface RunCollectorRepository {
  ensureActiveCharacterRun(nodeId: string): Promise<BotCharacterRun | null>;
  createCharacterRunSample(input: Record<string, unknown>): Promise<BotCharacterRunSample>;
}

export type RunDangerLevel = BotCharacterRunSample["dangerLevel"];

export class RuntimeRunCollector {
  private activeRun: BotCharacterRun | null = null;
  private nextRunRefreshAt = 0;
  private lastFrameAt = 0;
  private lastError = "";
  private pending: { perception: PerceptionResult; decision: LiveDecisionRecord } | null = null;
  private worker: Promise<void> | null = null;

  constructor(
    private readonly repository: RunCollectorRepository,
    private readonly nodeId: string,
    private readonly captureDir: string,
    private readonly frameIntervalMs: number,
    private readonly refreshIntervalMs = 5_000
  ) {}

  enqueue(perception: PerceptionResult, decision: LiveDecisionRecord): void {
    this.pending = { perception, decision };
    this.worker ??= this.drain().finally(() => { this.worker = null; });
  }

  async flush(): Promise<void> {
    await this.worker;
    if (this.pending) await this.record(this.pending.perception, this.pending.decision);
    this.pending = null;
  }

  async record(perception: PerceptionResult, decision: LiveDecisionRecord): Promise<void> {
    try {
      const run = await this.currentRun();
      if (!run) return;
      const operation = evaluateHuntOperation(policyFromRunSnapshot(run.routeSnapshotJson), perception.operationObservation);
      const dangerLevel = operation.action === "stop-stamina" ? "high" : classifyRunDanger(decision);
      await this.repository.createCharacterRunSample({
        runId: run.id,
        observedAt: decision.observedAt,
        sampleType: dangerLevel === "high" || dangerLevel === "critical" ? "danger" : "decision",
        decisionId: decision.id,
        dangerLevel,
        stateJson: {
          capturedAt: perception.capturedAt,
          frame: { id: perception.frame.id, width: perception.frame.width, height: perception.frame.height, source: perception.frame.source },
          entities: perception.entities,
          entityCounts: decision.entityCounts,
          perceptionConfidence: decision.perceptionConfidence,
          operationObservation: perception.operationObservation ?? null
        },
        actionJson: { decision: decision.decision, reasons: decision.reasons, commands: decision.commands, operation },
        outcomeJson: { status: "pending", requiresTelemetryOrFeedback: true }
      });
      if (Date.now() - this.lastFrameAt >= this.frameIntervalMs) await this.saveFrame(run, perception);
      this.lastError = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== this.lastError) console.warn(`[run-collector] ${message}`);
      this.lastError = message;
    }
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const current = this.pending;
      this.pending = null;
      await this.record(current.perception, current.decision);
    }
  }

  private async currentRun(): Promise<BotCharacterRun | null> {
    if (Date.now() < this.nextRunRefreshAt) return this.activeRun;
    this.activeRun = await this.repository.ensureActiveCharacterRun(this.nodeId);
    this.nextRunRefreshAt = Date.now() + this.refreshIntervalMs;
    return this.activeRun;
  }

  private async saveFrame(run: BotCharacterRun, perception: PerceptionResult): Promise<void> {
    const extension = perception.frame.mimeType === "image/jpeg" ? "jpg" : perception.frame.mimeType === "image/png" ? "png" : "bin";
    const directory = resolve(this.captureDir, String(run.id));
    await mkdir(directory, { recursive: true });
    const filename = `${perception.capturedAt.replace(/[:.]/g, "-")}-${perception.frame.id}.${extension}`;
    const path = join(directory, filename);
    await writeFile(path, perception.frame.data);
    await this.repository.createCharacterRunSample({
      runId: run.id,
      observedAt: perception.capturedAt,
      sampleType: "screen",
      framePath: path,
      stateJson: { width: perception.frame.width, height: perception.frame.height, mimeType: perception.frame.mimeType }
    });
    this.lastFrameAt = Date.now();
  }
}

export function classifyRunDanger(decision: LiveDecisionRecord): RunDangerLevel {
  if (decision.status === "error") return "high";
  const creatures = decision.entityCounts.creature;
  const unknown = decision.entityCounts.unknown;
  if (creatures >= 10) return "critical";
  if (creatures >= 7) return "high";
  if (creatures >= 4 || unknown >= 3) return "medium";
  if (creatures > 0 || unknown > 0) return "low";
  return "none";
}
