import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PerceptionEvent } from "../../src/coordination/perception-event.js";
import { LiveDecisionStore, decisionFrom, errorDecision } from "../../src/decision/live-decision-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("live decision monitor", () => {
  it("explains a passive observation without claiming execution", () => {
    const decision = decisionFrom(sampleEvent(), "passive-observation", []);

    expect(decision).toMatchObject({
      strategy: "passive-observation",
      mode: "observe",
      status: "observed",
      decision: "Nenhuma ação",
      commands: [],
      entityCounts: { player: 1, creature: 2, npc: 0 }
    });
    expect(decision.perceptionConfidence).toBeCloseTo(0.8);
  });

  it("labels produced commands as suggestions, not executed actions", () => {
    const decision = decisionFrom(sampleEvent(), "candidate-strategy", [{
      id: "command-1",
      type: "keyboard-press",
      createdAt: new Date().toISOString(),
      targetComputerId: "pc-main",
      payload: { key: "F1" }
    }]);

    expect(decision.mode).toBe("suggest");
    expect(decision.status).toBe("suggested");
    expect(decision.reasons.join(" ")).toContain("não está conectada");
  });

  it("persists newest-first snapshots and reports activity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "botzin-decisions-"));
    temporaryDirectories.push(directory);
    const store = new LiveDecisionStore(join(directory, "decisions.jsonl"));
    const first = decisionFrom(sampleEvent(), "passive-observation", []);
    const second = errorDecision("pc-main", "passive-observation", new Error("frame indisponível"));
    await store.append(first);
    await store.append(second);

    const snapshot = await store.snapshot(10, 60_000);
    expect(snapshot.active).toBe(true);
    expect(snapshot.records.map((record) => record.id)).toEqual([second.id, first.id]);
    expect(snapshot.records[0]?.error).toBe("frame indisponível");
  });
});

function sampleEvent(): PerceptionEvent {
  const observedAt = new Date().toISOString();
  return {
    id: "event-1",
    sourceComputerId: "pc-main",
    receivedAt: observedAt,
    capturedAt: observedAt,
    entities: [
      { id: "player", kind: "player", confidence: 0.9, box: { x: 0, y: 0, width: 10, height: 10 }, sourceComputerId: "pc-main", observedAt },
      { id: "creature-1", kind: "creature", confidence: 0.8, box: { x: 10, y: 0, width: 10, height: 10 }, sourceComputerId: "pc-main", observedAt },
      { id: "creature-2", kind: "creature", confidence: 0.7, box: { x: 20, y: 0, width: 10, height: 10 }, sourceComputerId: "pc-main", observedAt }
    ]
  };
}
