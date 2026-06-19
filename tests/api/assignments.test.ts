import { describe, it, expect, beforeAll } from "vitest";
import { post, json, loginAsOperator } from "../helpers/api.js";
import { createAccount, createCharacter, createMachine, createHunt } from "../helpers/fixtures.js";

describe("POST /api/assignments", () => {
  let opToken: string;
  let machineId: number;
  let characterId: number;
  let huntId: number;

  beforeAll(async () => {
    opToken = await loginAsOperator();

    const account = await createAccount(opToken, { loginIdentifier: "assign-test@example.com" });
    const [machine, character, hunt] = await Promise.all([
      createMachine(opToken, { nodeId: "assign-node" }),
      createCharacter(opToken, account.id as number, { name: "AssignChar" }),
      createHunt(opToken, { name: "AssignHunt" })
    ]);

    machineId = machine.id as number;
    characterId = character.id as number;
    huntId = hunt.id as number;
  });

  it("creates assignment with valid FK references and returns 201", async () => {
    const res = await post(
      "/api/assignments",
      { machineId, characterId, huntId, status: "active", priority: 50, notes: "High priority" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.machineId).toBe(machineId);
    expect(body.characterId).toBe(characterId);
    expect(body.huntId).toBe(huntId);
    expect(body.status).toBe("active");
    expect(body.priority).toBe(50);
    expect(body.notes).toBe("High priority");
  });

  it("status defaults to 'planned' when omitted", async () => {
    // Need a fresh character to avoid UNIQUE (machine, character) violation.
    const acc = await createAccount(opToken, { loginIdentifier: "assign-status@example.com" });
    const char = await createCharacter(opToken, acc.id as number, { name: "StatusChar" });
    const machine = await createMachine(opToken, { nodeId: "status-node" });

    const res = await post(
      "/api/assignments",
      { machineId: machine.id, characterId: char.id, huntId },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.status).toBe("planned");
    expect(body.priority).toBe(100);
  });

  it("returns 400 when machineId is missing", async () => {
    const res = await post("/api/assignments", { characterId, huntId }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"machineId"');
  });

  it("returns 400 when characterId is missing", async () => {
    const res = await post("/api/assignments", { machineId, huntId }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"characterId"');
  });

  it("returns 400 when huntId is missing", async () => {
    const res = await post("/api/assignments", { machineId, characterId }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"huntId"');
  });

  it("returns 5xx for non-existent machineId (FK violation)", async () => {
    const res = await post(
      "/api/assignments",
      { machineId: 999_999, characterId, huntId },
      opToken
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it("returns 5xx on duplicate (machineId, characterId) pair (unique constraint)", async () => {
    // First assignment created in the first test; trying same (machine, character) pair fails.
    const res = await post(
      "/api/assignments",
      { machineId, characterId, huntId },
      opToken
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
