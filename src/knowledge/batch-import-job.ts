import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ValidationError } from "../core/errors.js";

export interface BatchImportStatus<TFailure> {
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
  readonly current: string | null;
  readonly delayMs: number;
  readonly concurrency: number;
  readonly fatalError: string | null;
  readonly failures: readonly TFailure[];
}

export interface BatchImportConfig<TIdentity, TFailure> {
  readonly root: string;
  /** Human label for error messages, e.g. "creature animation" / "item asset". */
  readonly jobLabel: string;
  readonly emptyMessage: string;
  readonly importer: (options: { root: string; identity: TIdentity; refresh?: boolean }) => Promise<{ readonly cached: boolean }>;
  readonly describe: (identity: TIdentity) => string;
  readonly failureOf: (identity: TIdentity, reason: string) => TFailure;
  readonly minDelayMs: number;
  readonly maxConcurrency: number;
  /** Cap on recorded failures to bound the status file; null keeps every failure. */
  readonly maxRecordedFailures: number | null;
}

/**
 * Shared lifecycle for the sequential/concurrent import batches (creature
 * animations, item assets): status persistence, rate limiting, failure capture
 * and the running/complete/failed state machine live here so a fix applies to
 * every batch kind at once.
 */
export class BatchImportJob<TIdentity, TFailure> {
  private state: BatchImportStatus<TFailure> | null = null;
  private completion: Promise<void> | null = null;
  private refresh = false;

  constructor(private readonly config: BatchImportConfig<TIdentity, TFailure>) {}

  async start(
    items: readonly TIdentity[],
    delayMs: number,
    concurrency = 1,
    refresh = false
  ): Promise<BatchImportStatus<TFailure>> {
    if (this.state?.status === "running") {
      throw new ValidationError(`A ${this.config.jobLabel} import job is already running.`);
    }
    if (items.length === 0) throw new ValidationError(this.config.emptyMessage);
    if (!Number.isInteger(delayMs) || delayMs < this.config.minDelayMs || delayMs > 10_000) {
      throw new ValidationError(`delayMs must be an integer between ${this.config.minDelayMs} and 10000.`);
    }
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > this.config.maxConcurrency) {
      throw new ValidationError(`concurrency must be an integer between 1 and ${this.config.maxConcurrency}.`);
    }
    this.refresh = refresh;
    const now = new Date().toISOString();
    this.state = {
      version: 1,
      jobId: randomUUID(),
      status: "running",
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      total: items.length,
      completed: 0,
      imported: 0,
      cached: 0,
      failed: 0,
      current: null,
      delayMs,
      concurrency,
      fatalError: null,
      failures: []
    };
    try {
      await this.persist();
    } catch (error) {
      // A failed initial persist must not leave the in-memory state "running"
      // forever, which would reject every retry until the process restarts.
      this.state = null;
      throw error;
    }
    this.completion = this.run(items).catch(async (error) => {
      const finishedAt = new Date().toISOString();
      this.update({ status: "failed", current: null, finishedAt, fatalError: errorMessage(error) });
      await this.persist().catch(() => undefined);
    });
    return this.state;
  }

  async getStatus(): Promise<BatchImportStatus<TFailure> | null> {
    if (this.state) {
      if (this.state.status !== "running") await this.completion;
      return this.state;
    }
    const snapshot = await readFile(this.statusPath(), "utf8")
      .then((value) => JSON.parse(value) as BatchImportStatus<TFailure>)
      .catch(() => null);
    if (snapshot?.status === "running") {
      // A "running" snapshot with no in-memory state belongs to a process that
      // died mid-batch; serving it verbatim would report a live job forever.
      return {
        ...snapshot,
        status: "failed",
        finishedAt: snapshot.updatedAt,
        fatalError: "O job de importação foi interrompido por uma reinicialização do servidor."
      };
    }
    return snapshot;
  }

  private async run(items: readonly TIdentity[]): Promise<void> {
    const state = this.requiredState();
    let cursor = 0;
    let persisted = 0;
    const worker = async (): Promise<void> => {
      while (cursor < items.length) {
        const item = items[cursor++]!;
        this.update({ current: this.config.describe(item) });
        const contactedSource = await this.importOne(item);
        // Persisting on every item would rewrite the status file thousands of
        // times on large batches; one write per concurrency round is enough.
        persisted += 1;
        if (persisted % state.concurrency === 0) await this.persist();
        if (contactedSource && state.delayMs > 0 && this.requiredState().completed < items.length) {
          await wait(state.delayMs);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(state.concurrency, items.length) }, () => worker()));
    this.update({ status: "complete", current: null, finishedAt: new Date().toISOString() });
    await this.persist();
  }

  /** Returns whether the remote source was contacted, so cached items are not rate limited. */
  private async importOne(item: TIdentity): Promise<boolean> {
    try {
      const result = await this.config.importer({ root: this.config.root, identity: item, refresh: this.refresh });
      this.update({
        completed: this.requiredState().completed + 1,
        imported: this.requiredState().imported + (result.cached ? 0 : 1),
        cached: this.requiredState().cached + (result.cached ? 1 : 0)
      });
      return !result.cached;
    } catch (error) {
      const current = this.requiredState();
      const failure = this.config.failureOf(item, errorMessage(error));
      const cap = this.config.maxRecordedFailures;
      this.update({
        completed: current.completed + 1,
        failed: current.failed + 1,
        failures: cap === null || current.failures.length < cap ? [...current.failures, failure] : current.failures
      });
      return true;
    }
  }

  private update(patch: Partial<BatchImportStatus<TFailure>>): void {
    const state = this.requiredState();
    this.state = { ...state, ...patch, updatedAt: new Date().toISOString() };
  }

  private requiredState(): BatchImportStatus<TFailure> {
    if (!this.state) throw new Error(`${this.config.jobLabel} batch state is unavailable.`);
    return this.state;
  }

  private statusPath(): string {
    return join(this.config.root, "batch-status.json");
  }

  private async persist(): Promise<void> {
    await mkdir(this.config.root, { recursive: true });
    await writeFile(this.statusPath(), JSON.stringify(this.requiredState(), null, 2), "utf8");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
