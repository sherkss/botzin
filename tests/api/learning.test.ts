import { describe, it, expect, beforeAll } from "vitest";
import { post, json, loginAsOperator } from "../helpers/api.js";
import { createLearningMethod, createLearningSource } from "../helpers/fixtures.js";

describe("POST /api/learning-methods", () => {
  let opToken: string;

  beforeAll(async () => {
    opToken = await loginAsOperator();
  });

  it("creates learning method with all fields and returns 201", async () => {
    const res = await post(
      "/api/learning-methods",
      {
        name: "Demo Method",
        methodType: "human-demonstration",
        scope: "hunt",
        weight: 2.5,
        mode: "suggest",
        configJson: '{"key":"value"}',
        notes: "Observes human play",
        enabled: true
      },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.name).toBe("Demo Method");
    expect(body.methodType).toBe("human-demonstration");
    expect(body.scope).toBe("hunt");
    expect(body.weight).toBeCloseTo(2.5);
    expect(body.mode).toBe("suggest");
    expect(body.configJson).toBe('{"key":"value"}');
    expect(body.notes).toBe("Observes human play");
    expect(body.enabled).toBe(true);
  });

  it("defaults: methodType='manual-rules', scope='global', mode='observe', weight=1", async () => {
    const res = await post(
      "/api/learning-methods",
      { name: "Default Method" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.methodType).toBe("manual-rules");
    expect(body.scope).toBe("global");
    expect(body.mode).toBe("observe");
    expect(body.weight).toBeCloseTo(1);
  });

  it("returns 400 when name is missing", async () => {
    const res = await post("/api/learning-methods", { methodType: "replay" }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"name"');
  });

  it("returns 400 when configJson is invalid JSON", async () => {
    const res = await post(
      "/api/learning-methods",
      { name: "Bad JSON Method", configJson: "not-valid-json" },
      opToken
    );
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain("JSON");
  });
});

describe("POST /api/learning-sources", () => {
  let opToken: string;

  beforeAll(async () => {
    opToken = await loginAsOperator();
  });

  it("creates learning source with all fields and returns 201", async () => {
    const res = await post(
      "/api/learning-sources",
      {
        name: "Tibia Wiki Article",
        sourceType: "web-page",
        uri: "https://tibiawiki.com.br/wiki/Knight",
        language: "pt-BR",
        status: "ready",
        trustLevel: "high",
        notes: "Reference guide",
        enabled: true
      },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.name).toBe("Tibia Wiki Article");
    expect(body.sourceType).toBe("web-page");
    expect(body.uri).toBe("https://tibiawiki.com.br/wiki/Knight");
    expect(body.language).toBe("pt-BR");
    expect(body.status).toBe("ready");
    expect(body.trustLevel).toBe("high");
    expect(body.notes).toBe("Reference guide");
  });

  it("defaults: sourceType='manual-note', status='pending', trustLevel='medium'", async () => {
    const res = await post(
      "/api/learning-sources",
      { name: "Default Source" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.sourceType).toBe("manual-note");
    expect(body.status).toBe("pending");
    expect(body.trustLevel).toBe("medium");
  });

  it("returns 400 when name is missing", async () => {
    const res = await post("/api/learning-sources", { sourceType: "video" }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"name"');
  });
});

describe("POST /api/learning-method-sources", () => {
  let opToken: string;
  let methodId: number;
  let sourceId: number;

  beforeAll(async () => {
    opToken = await loginAsOperator();
    const [method, source] = await Promise.all([
      createLearningMethod(opToken, { name: "Link Method" }),
      createLearningSource(opToken, { name: "Link Source" })
    ]);
    methodId = method.id as number;
    sourceId = source.id as number;
  });

  it("links method and source and returns the link with defaults", async () => {
    const res = await post(
      "/api/learning-method-sources",
      { methodId, sourceId },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.methodId).toBe(methodId);
    expect(body.sourceId).toBe(sourceId);
    expect(body.role).toBe("primary");
    expect(body.weight).toBeCloseTo(1);
  });

  it("upserts on duplicate (methodId, sourceId) — updates role and weight", async () => {
    // Second call with same PK but different role should update, not error.
    const res = await post(
      "/api/learning-method-sources",
      { methodId, sourceId, role: "validation", weight: 0.5 },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.role).toBe("validation");
    expect(body.weight).toBeCloseTo(0.5);
  });

  it("returns 400 when methodId is missing", async () => {
    const res = await post("/api/learning-method-sources", { sourceId }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"methodId"');
  });
});

describe("POST /api/learning-sessions", () => {
  let opToken: string;
  let methodId: number;

  beforeAll(async () => {
    opToken = await loginAsOperator();
    const method = await createLearningMethod(opToken, { name: "Session Method" });
    methodId = method.id as number;
  });

  it("creates session with valid methodId and returns 201", async () => {
    const res = await post(
      "/api/learning-sessions",
      { methodId, name: "Hunt Session 001", status: "recording", notes: "First session" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.id).toBeTypeOf("number");
    expect(body.methodId).toBe(methodId);
    expect(body.name).toBe("Hunt Session 001");
    expect(body.status).toBe("recording");
    expect(body.notes).toBe("First session");
    expect(body.assignmentId).toBeNull();
    // startedAt must be a valid ISO timestamp.
    expect(new Date(body.startedAt as string).getTime()).toBeGreaterThan(0);
    expect(body.endedAt).toBeNull();
  });

  it("status defaults to 'recording' when omitted", async () => {
    const res = await post(
      "/api/learning-sessions",
      { methodId, name: "Default Status Session" },
      opToken
    );

    expect(res.status).toBe(201);
    const body = await json<Record<string, unknown>>(res);
    expect(body.status).toBe("recording");
  });

  it("returns 400 when name is missing", async () => {
    const res = await post("/api/learning-sessions", { methodId }, opToken);
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toContain('"name"');
  });

  it("returns 5xx for non-existent methodId (FK violation)", async () => {
    const res = await post(
      "/api/learning-sessions",
      { methodId: 999_999, name: "Orphan Session" },
      opToken
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
