import { beforeAll, describe, expect, it } from "vitest";
import { json, loginAsOperator, post } from "../helpers/api.js";
import { createLearningMethod } from "../helpers/fixtures.js";

describe("learning event and feedback pipeline", () => {
  let token: string;
  let sessionId: number;

  beforeAll(async () => {
    token = await loginAsOperator();
    const method = await createLearningMethod(token, { name: `Telemetry-${Date.now()}` });
    const sessionResponse = await post("/api/learning-sessions", {
      methodId: method.id,
      name: `Session-${Date.now()}`
    }, token);
    sessionId = (await json<{ id: number }>(sessionResponse)).id;
  });

  it("records state, action, reward and human feedback", async () => {
    const response = await post("/api/learning-events", {
      sessionId,
      eventType: "combat-decision",
      stateJson: '{"hp":75,"targets":2}',
      actionJson: '{"skill":"exori"}',
      reward: 1.25
    }, token);

    expect(response.status).toBe(201);
    const event = await json<Record<string, unknown>>(response);
    expect(event.sessionId).toBe(sessionId);
    expect(JSON.parse(event.stateJson as string)).toEqual({ hp: 75, targets: 2 });
    expect(JSON.parse(event.actionJson as string)).toEqual({ skill: "exori" });
    expect(event.reward).toBeCloseTo(1.25);

    const feedbackResponse = await post("/api/decision-feedback", {
      learningEventId: event.id,
      rating: "good",
      correctionActionJson: '{"skill":"exori gran"}'
    }, token);
    expect(feedbackResponse.status).toBe(201);
    const feedback = await json<Record<string, unknown>>(feedbackResponse);
    expect(feedback.rating).toBe("good");
    expect(JSON.parse(feedback.correctionActionJson as string)).toEqual({ skill: "exori gran" });
  });

  it("rejects feedback without a target", async () => {
    const response = await post("/api/decision-feedback", { rating: "bad" }, token);
    expect(response.status).toBe(400);
  });

  it("rejects unknown enum values before reaching MySQL", async () => {
    const response = await post("/api/decision-feedback", {
      learningEventId: 1,
      rating: "excellent"
    }, token);
    expect(response.status).toBe(400);
  });
});
