import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type KnowledgeFailureStage = "metadata" | "subtitle" | "transcription" | "document";

export interface KnowledgeFailure {
  readonly videoId: string;
  readonly url: string;
  readonly title: string | null;
  readonly infoPath: string | null;
  readonly stage: KnowledgeFailureStage;
  readonly reason: string;
  readonly attempts: number;
  readonly firstFailedAt: string;
  readonly lastFailedAt: string;
}

interface FailureFile {
  readonly version: 1;
  readonly updatedAt: string;
  readonly failures: readonly KnowledgeFailure[];
}

export class KnowledgeFailureQueue {
  private readonly failures = new Map<string, KnowledgeFailure>();

  private constructor(private readonly path: string) {}

  static async open(path: string): Promise<KnowledgeFailureQueue> {
    const queue = new KnowledgeFailureQueue(path);
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as FailureFile;
      for (const failure of value.failures ?? []) queue.failures.set(failure.videoId, failure);
    } catch {
      // A missing or invalid file starts an empty recoverable queue.
    }
    return queue;
  }

  list(): readonly KnowledgeFailure[] {
    return [...this.failures.values()].sort((left, right) => left.lastFailedAt.localeCompare(right.lastFailedAt));
  }

  async record(input: {
    videoId: string;
    url?: string;
    title?: string | null;
    infoPath?: string | null;
    stage: KnowledgeFailureStage;
    reason: string;
  }): Promise<void> {
    const previous = this.failures.get(input.videoId);
    const now = new Date().toISOString();
    this.failures.set(input.videoId, {
      videoId: input.videoId,
      url: input.url ?? previous?.url ?? `https://www.youtube.com/watch?v=${input.videoId}`,
      title: input.title ?? previous?.title ?? null,
      infoPath: input.infoPath ?? previous?.infoPath ?? null,
      stage: input.stage,
      reason: input.reason.slice(0, 2_000),
      attempts: (previous?.attempts ?? 0) + 1,
      firstFailedAt: previous?.firstFailedAt ?? now,
      lastFailedAt: now
    });
    await this.save();
  }

  async resolve(videoId: string): Promise<void> {
    if (!this.failures.delete(videoId)) return;
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    const value: FailureFile = { version: 1, updatedAt: new Date().toISOString(), failures: this.list() };
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
    await rename(temporaryPath, this.path);
  }
}
