import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KnowledgeFailureQueue } from "../../src/knowledge/knowledge-failure-queue.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("KnowledgeFailureQueue", () => {
  it("persists attempts and removes a video after success", async () => {
    const directory = await mkdtemp(join(tmpdir(), "botzin-failures-"));
    directories.push(directory);
    const path = join(directory, "failed-videos.json");
    const queue = await KnowledgeFailureQueue.open(path);
    await queue.record({ videoId: "AZnQORbwiwI", stage: "subtitle", reason: "HTTP 429" });
    await queue.record({ videoId: "AZnQORbwiwI", stage: "subtitle", reason: "HTTP 429 novamente" });

    const restored = await KnowledgeFailureQueue.open(path);
    expect(restored.list()).toHaveLength(1);
    expect(restored.list()[0]).toMatchObject({ videoId: "AZnQORbwiwI", attempts: 2, reason: "HTTP 429 novamente" });

    await restored.resolve("AZnQORbwiwI");
    expect(JSON.parse(await readFile(path, "utf8")).failures).toEqual([]);
  });
});
