import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface VisualTrainingFrame {
  readonly index: number;
  readonly timestampSeconds: number;
  readonly path: string;
}

export interface VisualTrainingVideo {
  readonly videoId: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly uploader: string | null;
  readonly publishedAt: string | null;
  readonly durationSeconds: number | null;
  readonly frameIntervalSeconds: number;
  readonly videoPath: string | null;
  readonly sourceVideoDeleted: boolean;
  readonly framesDirectory: string;
  readonly frames: readonly VisualTrainingFrame[];
  readonly preparedAt: string;
  readonly analysisStatus?: "pending" | "complete";
  readonly analysisPath?: string | null;
  readonly analyzedFrames?: number;
  readonly analyzedAt?: string | null;
  readonly framesDeletedAfterAnalysis?: boolean;
}

export interface VisualTrainingFailure {
  readonly videoId: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly reason: string;
  readonly attempts: number;
  readonly firstFailedAt: string;
  readonly lastFailedAt: string;
}

interface DatasetIndexFile {
  readonly version: 1;
  readonly updatedAt: string;
  readonly videos: readonly VisualTrainingVideo[];
}

interface FailureFile {
  readonly version: 1;
  readonly updatedAt: string;
  readonly failures: readonly VisualTrainingFailure[];
}

export class VisualTrainingDataset {
  private readonly videos = new Map<string, VisualTrainingVideo>();
  private readonly failures = new Map<string, VisualTrainingFailure>();

  private constructor(
    private readonly indexPath: string,
    private readonly failuresPath: string
  ) {}

  static async open(root: string): Promise<VisualTrainingDataset> {
    const dataset = new VisualTrainingDataset(`${root}/dataset-index.json`, `${root}/failed-videos.json`);
    const index = await readJson<DatasetIndexFile>(dataset.indexPath);
    const failureFile = await readJson<FailureFile>(dataset.failuresPath);
    for (const video of index?.videos ?? []) dataset.videos.set(video.videoId, video);
    for (const failure of failureFile?.failures ?? []) dataset.failures.set(failure.videoId, failure);
    return dataset;
  }

  listVideos(): readonly VisualTrainingVideo[] {
    return [...this.videos.values()].sort((left, right) => left.videoId.localeCompare(right.videoId));
  }

  listFailures(): readonly VisualTrainingFailure[] {
    return [...this.failures.values()].sort((left, right) => left.lastFailedAt.localeCompare(right.lastFailedAt));
  }

  async complete(video: VisualTrainingVideo): Promise<void> {
    this.videos.set(video.videoId, video);
    this.failures.delete(video.videoId);
    await Promise.all([this.saveIndex(), this.saveFailures()]);
  }

  async fail(input: { videoId: string; title: string; sourceUrl: string; reason: string }): Promise<void> {
    const previous = this.failures.get(input.videoId);
    const now = new Date().toISOString();
    this.failures.set(input.videoId, {
      ...input,
      reason: input.reason.slice(0, 2_000),
      attempts: (previous?.attempts ?? 0) + 1,
      firstFailedAt: previous?.firstFailedAt ?? now,
      lastFailedAt: now
    });
    await this.saveFailures();
  }

  private async saveIndex(): Promise<void> {
    await writeJsonAtomic(this.indexPath, {
      version: 1,
      updatedAt: new Date().toISOString(),
      videos: this.listVideos()
    } satisfies DatasetIndexFile);
  }

  private async saveFailures(): Promise<void> {
    await writeJsonAtomic(this.failuresPath, {
      version: 1,
      updatedAt: new Date().toISOString(),
      failures: this.listFailures()
    } satisfies FailureFile);
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
}
