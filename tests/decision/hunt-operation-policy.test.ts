import { describe, expect, it } from "vitest";
import { evaluateHuntOperation, policyFromRunSnapshot } from "../../src/decision/hunt-operation-policy.js";

describe("hunt stamina and refill policy", () => {
  const policy = policyFromRunSnapshot(JSON.stringify({
    minStaminaMinutes: 2340,
    refill: {
      capacityBelow: 200,
      depositLoot: true,
      supplies: { "ultimate mana potion": { returnAt: 300, buyTo: 1200 } }
    }
  }));

  it("waits safely while the screen reader has no operational reading", () => {
    expect(evaluateHuntOperation(policy, null).action).toBe("await-reading");
  });

  it("stops the hunt below the configured stamina", () => {
    expect(evaluateHuntOperation(policy, { staminaMinutes: 2339, capacity: 500, supplies: { "ultimate mana potion": 900 } }).action)
      .toBe("stop-stamina");
  });

  it("requests refill from low supplies or capacity", () => {
    const lowSupply = evaluateHuntOperation(policy, { staminaMinutes: 2400, capacity: 500, supplies: { "ultimate mana potion": 300 } });
    expect(lowSupply.action).toBe("refill");
    expect(lowSupply.refillItems).toContain("ultimate mana potion");
    expect(evaluateHuntOperation(policy, { staminaMinutes: 2400, capacity: 199, supplies: { "ultimate mana potion": 900 } }).action)
      .toBe("refill");
  });

  it("continues when all configured limits are healthy", () => {
    expect(evaluateHuntOperation(policy, { staminaMinutes: 2400, capacity: 500, supplies: { "ultimate mana potion": 900 } }).action)
      .toBe("continue");
  });
});
