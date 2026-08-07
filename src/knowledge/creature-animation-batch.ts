import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ValidationError } from "../core/errors.js";
import {
  importCreatureAnimation,
  type CreatureAnimationIdentity,
  type CreatureAnimationImportResult
} from "./creature-animation-importer.js";

export interface CreatureAnimationBatchFailure {
  readonly race: string;
  readonly name: string;
  readonly reason: string;
}

export interface CreatureAnimationBatchStatus {
  readonly version: 1;
  readonly jobId: string;
  readonly status: "running" | "complete" | "failed";
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly finishedAt: string | null;
  readonly total: number;
  readonly completed: number;
  readonly imported: number;
  readonly cached: number;
  readonly failed: number;
  readonly currentRace: string | null;
  readonly delayMs: number;
  readonly fatalError: string | null;
  readonly failures: readonly CreatureAnimationBatchFailure[];
}

type AnimationImporter = (options: {
  root: string;
  identity: CreatureAnimationIdentity;
}) => Promise<CreatureAnimationImportResult>;

export class CreatureAnimationBatchJob {
  private state: CreatureAnimationBatchStatus | null = null;
  private completion: Promise<void> | null = null;

  constructor(
    private readonly root: string,
    private readonly importer: AnimationImporter = importCreatureAnimation
  ) {}

  async start(creatures: readonly CreatureAnimationIdentity[], delayMs = 750): Promise<CreatureAnimationBatchStatus> {
    if (this.state?.status === "running") throw new ValidationError("A creature animation import job is already running.");
    if (creatures.length === 0) throw new ValidationError("The creature catalog is empty.");
    if (!Number.isInteger(delayMs) || delayMs < 250 || delayMs > 10_000) {
      throw new ValidationError("delayMs must be an integer between 250 and 10000.");
    }
    const now = new Date().toISOString();
    this.state = {
      version: 1,
      jobId: randomUUID(),
      status: "running",
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      total: creatures.length,
      completed: 0,
      imported: 0,
      cached: 0,
      failed: 0,
      currentRace: null,
      delayMs,
      fatalError: null,
      failures: []
    };
    await this.persist();
    this.completion = this.run(creatures).catch(async (error) => {
      const finishedAt = new Date().toISOString();
      this.update({ status: "failed", currentRace: null, finishedAt, fatalError: errorMessage(error) });
      await this.persist().catch(() => undefined);
    });
    return this.state;
  }

  async getStatus(): Promise<CreatureAnimationBatchStatus | null> {
    if (this.state) {
      if (this.state.status !== "running") await this.completion;
      return this.state;
    }
    return readFile(this.statusPath(), "utf8")
      .then((value) => JSON.parse(value) as CreatureAnimationBatchStatus)
      .catch(() => null);
  }

  private async run(creatures: readonly CreatureAnimationIdentity[]): Promise<void> {
    for (const creature of creatures) {
      this.update({ currentRace: creature.race });
      let contactedSource = false;
      try {
        const result = await this.importer({ root: this.root, identity: creature });
        contactedSource = !result.cached;
        this.update({
          completed: this.requiredState().completed + 1,
          imported: this.requiredState().imported + (result.cached ? 0 : 1),
          cached: this.requiredState().cached + (result.cached ? 1 : 0)
        });
      } catch (error) {
        contactedSource = true;
        const failure = { race: creature.race, name: creature.name, reason: errorMessage(error) };
        this.update({
          completed: this.requiredState().completed + 1,
          failed: this.requiredState().failed + 1,
          failures: [...this.requiredState().failures, failure]
        });
      }
      await this.persist();
      if (contactedSource && this.requiredState().completed < creatures.length) await wait(this.requiredState().delayMs);
    }
    const finishedAt = new Date().toISOString();
    this.update({ status: "complete", currentRace: null, finishedAt });
    await this.persist();
  }

  private update(patch: Partial<CreatureAnimationBatchStatus>): void {
    const state = this.requiredState();
    this.state = { ...state, ...patch, updatedAt: new Date().toISOString() };
  }

  private requiredState(): CreatureAnimationBatchStatus {
    if (!this.state) throw new Error("Creature animation batch state is unavailable.");
    return this.state;
  }

  private statusPath(): string {
    return join(this.root, "batch-status.json");
  }

  private async persist(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.statusPath(), JSON.stringify(this.requiredState(), null, 2), "utf8");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
