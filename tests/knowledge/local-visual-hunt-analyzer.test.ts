import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeVisualTrainingVideo, ensureLocalVisualModel, visualArtifactPath, type LocalVisualAnalyzerOptions } from "../../src/knowledge/local-visual-hunt-analyzer.js";
import type { VisualTrainingVideo } from "../../src/knowledge/visual-training-dataset.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("local visual hunt analysis", () => {
  it("rejects frame paths outside the visual dataset", () => {
    expect(() => visualArtifactPath("C:\\dataset", "..\\outside")).toThrow(/fora do dataset/i);
  });

  it("analyzes every extracted frame, indexes the report and resumes from checkpoints", async () => {
    const knowledgeRoot = await mkdtemp(join(tmpdir(), "botzin-visual-ai-"));
    directories.push(knowledgeRoot);
    const visualTrainingRoot = join(knowledgeRoot, "visual-training");
    await mkdir(join(visualTrainingRoot, "frames", "video123456"), { recursive: true });
    await writeFile(join(visualTrainingRoot, "frames", "video123456", "frame-000001.jpg"), "one");
    await writeFile(join(visualTrainingRoot, "frames", "video123456", "frame-000002.jpg"), "two");
    const video: VisualTrainingVideo = {
      videoId: "video123456",
      title: "EK 300 Hunt",
      sourceUrl: "https://youtube.com/watch?v=video123456",
      uploader: null,
      publishedAt: null,
      durationSeconds: 4,
      frameIntervalSeconds: 2,
      videoPath: null,
      sourceVideoDeleted: true,
      framesDirectory: "frames/video123456",
      frames: [
        { index: 1, timestampSeconds: 0, path: "frames/video123456/frame-000001.jpg" },
        { index: 2, timestampSeconds: 2, path: "frames/video123456/frame-000002.jpg" }
      ],
      preparedAt: new Date().toISOString()
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/api/tags")) return Response.json({ models: [{ name: "gemma3:4b" }] });
      return Response.json({ message: { content: JSON.stringify({ observations: [
        observation(1, 0, "Corredor da hunt", false),
        observation(2, 2, "Combate com dragon", true)
      ] }) } });
    }) as unknown as typeof fetch;
    const options: LocalVisualAnalyzerOptions = {
      visualTrainingRoot,
      knowledgeRoot,
      ollamaUrl: "http://127.0.0.1:11434",
      model: "gemma3:4b",
      batchSize: 2,
      concurrency: 1,
      retries: 1,
      fetcher
    };

    await ensureLocalVisualModel(options);
    const first = await analyzeVisualTrainingVideo(video, options);
    expect(first.report.totalFrames).toBe(2);
    expect(first.report.combatFrames).toBe(1);
    expect(first.video).toMatchObject({ analysisStatus: "complete", analyzedFrames: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(join(knowledgeRoot, "knowledge-index.json"), "utf8")).documents).toBe(1);

    const failIfCalled = vi.fn(async () => { throw new Error("checkpoint não foi usado"); }) as unknown as typeof fetch;
    const resumed = await analyzeVisualTrainingVideo(video, { ...options, fetcher: failIfCalled });
    expect(resumed.report.totalFrames).toBe(2);
    expect(failIfCalled).not.toHaveBeenCalled();
  });
});

function observation(frameIndex: number, timestampSeconds: number, scene: string, combat: boolean): object {
  return {
    frameIndex,
    timestampSeconds,
    scene,
    combat,
    playerCount: 1,
    creatures: combat ? ["dragon"] : [],
    spellsOrRunes: combat ? ["exori"] : [],
    visibleText: [],
    minimapOrRoute: "leste",
    sessionStats: { xpPerHour: null, rawXpPerHour: null, profit: null },
    confidence: 0.8,
    notes: ""
  };
}
