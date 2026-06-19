import { describe, it, expect, beforeAll } from "vitest";
import { post, json, loginAsOperator, loginAsViewer } from "../helpers/api.js";

describe("POST /api/accounts", () => {
  let opToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    [opToken, viewerToken] = await Promise.all([loginAsOperator(), loginAsViewer()]);
  });

  it("creates account with all fields and returns 201", async () => {
    const res = await post(
      "/api/accounts",
      {
        name: "My Tibia Account",
        loginIdentifier: "tibia-user@example.com",
        secretReference: "vault:tibia/account1",
        notes: "Main account",
        enabled: true
      },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.name).toBe("My Tibia Account");
    expect(body.loginIdentifier).toBe("tibia-user@example.com");
    expect(body.secretReference).toBe("vault:tibia/account1");
    expect(body.notes).toBe("Main account");
    expect(body.enabled).toBe(true);
  });

  it("creates account with only required fields — optional fields default to null/true", async () => {
    const res = await post(
      "/api/accounts",
      { name: "Minimal", loginIdentifier: "minimal@example.com" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.secretReference).toBeNull();
    expect(body.notes).toBeNull();
    expect(body.enabled).toBe(true);
  });

  it("enabled: false is stored and returned correctly", async () => {
    const res = await post(
      "/api/accounts",
      { name: "Disabled Account", loginIdentifier: "disabled@example.com", enabled: false },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.enabled).toBe(false);
  });

  it("returns 400 when name is missing — error message names the field", async () => {
    const res = await post("/api/accounts", { loginIdentifier: "x@example.com" }, opToken);

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"name"');
  });

  it("returns 400 when loginIdentifier is missing — error message names the field", async () => {
    const res = await post("/api/accounts", { name: "NoLogin" }, opToken);

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"loginIdentifier"');
  });

  it("returns 400 when name is an empty string", async () => {
    const res = await post(
      "/api/accounts",
      { name: "  ", loginIdentifier: "x@example.com" },
      opToken
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when called without a token", async () => {
    const res = await post("/api/accounts", { name: "x", loginIdentifier: "x@x.com" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when called by a viewer — viewer cannot mutate data", async () => {
    const res = await post(
      "/api/accounts",
      { name: "x", loginIdentifier: "v@x.com" },
      viewerToken
    );

    expect(res.status).toBe(403);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"operator"');
  });

  it("returns 5xx on duplicate loginIdentifier (MySQL unique constraint)", async () => {
    const payload = { name: "Dup", loginIdentifier: "dup@example.com" };
    const first = await post("/api/accounts", payload, opToken);
    expect(first.status).toBe(201);

    const second = await post("/api/accounts", payload, opToken);
    expect(second.status).toBeGreaterThanOrEqual(500);
  });
});
