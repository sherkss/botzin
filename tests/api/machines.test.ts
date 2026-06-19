import { describe, it, expect, beforeAll } from "vitest";
import { post, json, loginAsOperator } from "../helpers/api.js";

describe("POST /api/machines", () => {
  let opToken: string;

  beforeAll(async () => {
    opToken = await loginAsOperator();
  });

  it("creates machine with all fields and returns 201", async () => {
    const res = await post(
      "/api/machines",
      {
        nodeId: "pc-main",
        name: "Main PC",
        role: "perception",
        preferredHost: "192.168.1.10",
        connectionNotes: "Ethernet only",
        enabled: true
      },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.nodeId).toBe("pc-main");
    expect(body.name).toBe("Main PC");
    expect(body.role).toBe("perception");
    expect(body.preferredHost).toBe("192.168.1.10");
    expect(body.connectionNotes).toBe("Ethernet only");
    expect(body.enabled).toBe(true);
  });

  it("role defaults to 'perception' when omitted", async () => {
    const res = await post(
      "/api/machines",
      { nodeId: "no-role-node", name: "No Role Machine" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.role).toBe("perception");
  });

  it("optional fields default to null", async () => {
    const res = await post(
      "/api/machines",
      { nodeId: "minimal-node", name: "Minimal Machine" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.preferredHost).toBeNull();
    expect(body.connectionNotes).toBeNull();
  });

  it("returns 400 when nodeId is missing", async () => {
    const res = await post("/api/machines", { name: "No Node ID" }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"nodeId"');
  });

  it("returns 400 when name is missing", async () => {
    const res = await post("/api/machines", { nodeId: "some-node" }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"name"');
  });

  it("returns 5xx on duplicate nodeId (unique constraint)", async () => {
    const payload = { nodeId: "dup-node", name: "First" };
    await post("/api/machines", payload, opToken);
    const res = await post("/api/machines", { nodeId: "dup-node", name: "Second" }, opToken);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
