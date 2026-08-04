import { beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { ConfigurationRepository } from "../../src/database/configuration-repository.js";
import { get, json, loginAsOperator, post } from "../helpers/api.js";
import { createAccount, createAssignment, createCharacter, createHunt, createMachine } from "../helpers/fixtures.js";
import { MYSQL_HOST, MYSQL_PASSWORD, MYSQL_PORT, MYSQL_USER, TEST_DB } from "../helpers/test-config.js";

describe("character runs", () => {
  let token: string;
  let characterId: number;
  let huntId: number;
  let assignmentId: number;
  let runId: number;

  beforeAll(async () => {
    token = await loginAsOperator();
    const account = await createAccount(token);
    const character = await createCharacter(token, account.id as number);
    const hunt = await createHunt(token);
    const machine = await createMachine(token, { nodeId: "character-run-node" });
    const assignment = await createAssignment(
      token,
      machine.id as number,
      character.id as number,
      hunt.id as number,
      { status: "active" }
    );
    characterId = character.id as number;
    huntId = hunt.id as number;
    assignmentId = assignment.id as number;
  });

  it("starts one correlated run for an active assignment", async () => {
    const response = await post("/api/character-runs/start", {
      assignmentId,
      clientVersion: "15.20",
      loadoutJson: { equipment: ["helmet", "armor"], wheel: "hunt preset" },
      routeSnapshotJson: { waypoint: "entry", direction: "north" }
    }, token);

    expect(response.status).toBe(201);
    const run = await json<Record<string, unknown>>(response);
    runId = run.id as number;
    expect(run.assignmentId).toBe(assignmentId);
    expect(run.characterId).toBe(characterId);
    expect(run.huntId).toBe(huntId);
    expect(run.status).toBe("running");
    expect(JSON.parse(run.loadoutJson as string).wheel).toBe("hunt preset");
  });

  it("rejects a second running session for the same assignment", async () => {
    const response = await post("/api/character-runs/start", { assignmentId }, token);
    expect(response.status).toBe(400);
  });

  it("stores decisions and lists the run timeline", async () => {
    const created = await post("/api/character-run-samples", {
      runId,
      sampleType: "decision",
      decisionId: "decision-test-1",
      dangerLevel: "medium",
      stateJson: { creatures: 4, hpPercent: 72 },
      actionJson: { action: "use-rune", rune: "avalanche" }
    }, token);
    expect(created.status).toBe(201);

    const response = await get(`/api/character-run-samples?runId=${runId}`, token);
    expect(response.status).toBe(200);
    const body = await json<{ samples: Array<Record<string, unknown>> }>(response);
    expect(body.samples.some((sample) => sample.decisionId === "decision-test-1")).toBe(true);
  });

  it("links real Session Analyser results to the same run", async () => {
    const response = await post("/api/hunt-telemetry/import-analyser", {
      runId,
      characterId,
      huntId,
      xpRatePercent: 150,
      rawText: "Session: 00:30h\nXP Gain: 150,000\nRaw XP Gain: 100,000\nXP/h: 300,000\nRaw XP/h: 200,000\nLoot: 80,000\nSupplies: 30,000\nBalance: 50,000"
    }, token);

    expect(response.status).toBe(201);
    const telemetry = await json<Record<string, unknown>>(response);
    expect(telemetry.runId).toBe(runId);
    expect(telemetry.assignmentId).toBe(assignmentId);

    const samples = await json<{ samples: Array<Record<string, unknown>> }>(
      await get(`/api/character-run-samples?runId=${runId}`, token)
    );
    expect(samples.samples.some((sample) => sample.sampleType === "telemetry")).toBe(true);
  });

  it("rejects telemetry linked to a run from another character", async () => {
    const account = await createAccount(token);
    const otherCharacter = await createCharacter(token, account.id as number);
    const response = await post("/api/hunt-telemetry", {
      runId,
      characterId: otherCharacter.id,
      huntId,
      xpRatePercent: 150
    }, token);
    expect(response.status).toBe(400);
  });

  it("completes the run and preserves its history", async () => {
    const response = await post(`/api/character-runs/${runId}/stop`, { status: "completed" }, token);
    expect(response.status).toBe(200);
    const run = await json<Record<string, unknown>>(response);
    expect(run.status).toBe("completed");
    expect(run.endedAt).toEqual(expect.any(String));

    const list = await json<{ runs: Array<Record<string, unknown>> }>(await get("/api/character-runs", token));
    expect(list.runs.find((candidate) => candidate.id === runId)?.status).toBe("completed");
  });

  it("automatically opens and closes a run from the machine assignment", async () => {
    const account = await createAccount(token);
    const character = await createCharacter(token, account.id as number);
    const hunt = await createHunt(token);
    const machine = await createMachine(token, { nodeId: "automatic-run-node" });
    const assignment = await createAssignment(
      token, machine.id as number, character.id as number, hunt.id as number,
      { status: "active", minStaminaMinutes: 2340, refillConfigJson: { capacityBelow: 200 } }
    );
    const pool = mysql.createPool({
      host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: TEST_DB
    });
    try {
      const repository = new ConfigurationRepository(pool);
      const automaticRun = await repository.ensureActiveCharacterRun("automatic-run-node");
      expect(automaticRun).toMatchObject({
        assignmentId: assignment.id,
        characterId: character.id,
        huntId: hunt.id,
        status: "running"
      });
      expect(JSON.parse(automaticRun!.routeSnapshotJson as string)).toMatchObject({
        minStaminaMinutes: 2340,
        refill: { capacityBelow: 200 }
      });

      await post(`/api/assignments/${assignment.id}/status`, { status: "paused" }, token);
      expect(await repository.ensureActiveCharacterRun("automatic-run-node")).toBeNull();
      const stored = (await repository.listCharacterRuns()).find((candidate) => candidate.id === automaticRun!.id);
      expect(stored?.status).toBe("completed");
    } finally {
      await pool.end();
    }
  });
});
