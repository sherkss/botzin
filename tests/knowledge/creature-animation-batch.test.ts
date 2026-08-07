import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CreatureAnimationBatchJob } from "../../src/knowledge/creature-animation-batch.js";
import type { CreatureAnimationIdentity, CreatureAnimationImportResult } from "../../src/knowledge/creature-animation-importer.js";

const temporaryDirectories: string[] = [];
const creatures: CreatureAnimationIdentity[] = [
  { catalogId: 1, race: "dragon", name: "Dragon", officialImageUrl: null },
  { catalogId: 2, race: "demon", name: "Demon", officialImageUrl: null },
  { catalogId: 3, race: "rat", name: "Rat", officialImageUrl: null }
];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("creature animation batch job", () => {
  it("continues after failures and persists progress", async () => {
    const root = await temporaryRoot();
    const importer = async ({ identity }: { root: string; identity: CreatureAnimationIdentity }): Promise<CreatureAnimationImportResult> => {
      if (identity.race === "demon") throw new Error("animation missing");
      return result(identity, identity.race === "rat");
    };
    const job = new CreatureAnimationBatchJob(root, importer);
    const started = await job.start(creatures, 250);
    expect(started.status).toBe("running");
    const completed = await waitForCompletion(job);

    expect(completed).toMatchObject({ status: "complete", total: 3, completed: 3, imported: 1, cached: 1, failed: 1 });
    expect(completed.failures).toEqual([{ race: "demon", name: "Demon", reason: "animation missing" }]);
    const persisted = JSON.parse(await readFile(join(root, "batch-status.json"), "utf8"));
    expect(persisted).toMatchObject({ jobId: started.jobId, status: "complete", completed: 3 });
  });

  it("prevents two batch jobs from running concurrently", async () => {
    const root = await temporaryRoot();
    const importer = async ({ identity }: { root: string; identity: CreatureAnimationIdentity }): Promise<CreatureAnimationImportResult> => {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      return result(identity, false);
    };
    const job = new CreatureAnimationBatchJob(root, importer);
    await job.start([creatures[0]!], 250);
    await expect(job.start([creatures[1]!], 250)).rejects.toThrow("already running");
    await waitForCompletion(job);
  });

  it("validates the rate-limit delay", async () => {
    const root = await temporaryRoot();
    const job = new CreatureAnimationBatchJob(root, async ({ identity }) => result(identity, false));
    await expect(job.start(creatures, 100)).rejects.toThrow("between 250 and 10000");
  });
});

function result(identity: CreatureAnimationIdentity, cached: boolean): CreatureAnimationImportResult {
  return {
    cached,
    manifestPath: `${identity.race}/manifest.json`,
    manifest: {
      version: 1, catalogId: identity.catalogId, race: identity.race, name: identity.name,
      source: "tibia-fandom", sourceUrl: "https://static.wikia.nocookie.net/test.gif",
      descriptionUrl: "https://tibia.fandom.com/", sha256: "abc", width: 64, height: 64,
      frameCount: 2, frameDelayMs: [100, 100], importedAt: new Date().toISOString(),
      usage: "local-visual-training", files: ["frames/001.png", "frames/002.png"]
    }
  };
}

async function waitForCompletion(job: CreatureAnimationBatchJob) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await job.getStatus();
    if (status?.status === "complete") return status;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error("batch did not complete");
}

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "botzin-creature-batch-"));
  temporaryDirectories.push(directory);
  return directory;
}
