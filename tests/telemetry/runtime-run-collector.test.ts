import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BotCharacterRun, BotCharacterRunSample } from "../../src/core/bot-configuration.js";
import type { LiveDecisionRecord } from "../../src/decision/live-decision-store.js";
import type { PerceptionResult } from "../../src/perception/perception-pipeline.js";
import { RuntimeRunCollector, classifyRunDanger, type RunCollectorRepository } from "../../src/telemetry/runtime-run-collector.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("RuntimeRunCollector", () => {
  it("classifies danger from perception counts and decision errors", () => {
    expect(classifyRunDanger(decision({ creature: 0, unknown: 0 }))).toBe("none");
    expect(classifyRunDanger(decision({ creature: 1, unknown: 0 }))).toBe("low");
    expect(classifyRunDanger(decision({ creature: 4, unknown: 0 }))).toBe("medium");
    expect(classifyRunDanger(decision({ creature: 7, unknown: 0 }))).toBe("high");
    expect(classifyRunDanger(decision({ creature: 10, unknown: 0 }))).toBe("critical");
    expect(classifyRunDanger({ ...decision({ creature: 0, unknown: 0 }), status: "error" })).toBe("high");
  });

  it("persists the live decision and a periodic frame for the active character", async () => {
    const captureDirectory = await mkdtemp(join(tmpdir(), "botzin-run-"));
    temporaryDirectories.push(captureDirectory);
    const samples: Record<string, unknown>[] = [];
    const repository: RunCollectorRepository = {
      async ensureActiveCharacterRun() { return activeRun(); },
      async createCharacterRunSample(input) {
        samples.push(input);
        return { id: samples.length, ...input } as unknown as BotCharacterRunSample;
      }
    };
    const collector = new RuntimeRunCollector(repository, "node-1", captureDirectory, 1);
    const perception: PerceptionResult = {
      sourceComputerId: "node-1",
      capturedAt: "2026-08-04T12:30:00.000Z",
      entities: [{
        id: "dragon-1", kind: "creature", confidence: 0.93,
        box: { x: 10, y: 20, width: 30, height: 40 },
        label: "Dragon", sourceComputerId: "node-1", observedAt: "2026-08-04T12:30:00.000Z"
      }],
      frame: {
        id: "frame-1", sourceComputerId: "node-1", source: "mock",
        capturedAt: "2026-08-04T12:30:00.000Z", width: 2, height: 2,
        data: new Uint8Array([1, 2, 3, 4]), mimeType: "image/png"
      }
    };

    await collector.record(perception, decision({ creature: 1, unknown: 0 }));

    expect(samples.map((sample) => sample.sampleType)).toEqual(["decision", "screen"]);
    expect(samples[0]).toMatchObject({ runId: 42, dangerLevel: "low" });
    const framePath = samples[1].framePath as string;
    expect(Array.from(await readFile(framePath))).toEqual([1, 2, 3, 4]);
  });
});

function activeRun(): BotCharacterRun {
  return {
    id: 42, assignmentId: 10, machineId: 20, characterId: 30, huntId: 40,
    status: "running", clientVersion: null, loadoutJson: null, routeSnapshotJson: null,
    startedAt: "2026-08-04T12:00:00.000Z", endedAt: null, notes: null
  };
}

function decision(counts: { creature: number; unknown: number }): LiveDecisionRecord {
  return {
    id: "decision-1", observedAt: "2026-08-04T12:30:00.000Z", sourceComputerId: "node-1",
    strategy: "passive", mode: "observe", status: "observed", decision: "Nenhuma ação",
    reasons: ["test"], perceptionConfidence: 0.93,
    entityCounts: { player: 0, creature: counts.creature, npc: 0, "player-summon": 0, unknown: counts.unknown },
    commands: [], error: null
  };
}
