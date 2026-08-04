import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VisualTrainingDataset } from "../../src/knowledge/visual-training-dataset.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("VisualTrainingDataset", () => {
  it("moves a retried video from failures into the prepared dataset", async () => {
    const root = await mkdtemp(join(tmpdir(), "botzin-visual-training-"));
    directories.push(root);
    const dataset = await VisualTrainingDataset.open(root);
    await dataset.fail({ videoId: "AZnQORbwiwI", title: "Hunt", sourceUrl: "https://youtu.be/AZnQORbwiwI", reason: "HTTP 429" });
    await dataset.fail({ videoId: "AZnQORbwiwI", title: "Hunt", sourceUrl: "https://youtu.be/AZnQORbwiwI", reason: "HTTP 429 novamente" });
    expect(dataset.listFailures()[0]?.attempts).toBe(2);

    await dataset.complete({
      videoId: "AZnQORbwiwI",
      title: "Hunt",
      sourceUrl: "https://youtu.be/AZnQORbwiwI",
      uploader: "Canal",
      publishedAt: "2025-01-02",
      durationSeconds: 120,
      frameIntervalSeconds: 2,
      videoPath: "videos/AZnQORbwiwI/source.mp4",
      sourceVideoDeleted: false,
      framesDirectory: "frames/AZnQORbwiwI",
      frames: [{ index: 1, timestampSeconds: 0, path: "frames/AZnQORbwiwI/frame-000001.jpg" }],
      preparedAt: new Date().toISOString()
    });

    expect(dataset.listFailures()).toEqual([]);
    expect(dataset.listVideos()).toHaveLength(1);
    expect(JSON.parse(await readFile(join(root, "failed-videos.json"), "utf8")).failures).toEqual([]);
  });
});
