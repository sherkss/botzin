import { describe, expect, it } from "vitest";
import { parseGameNumber, parseSessionAnalyser } from "../../src/telemetry/session-analyser-parser.js";

describe("Session Analyser parser", () => {
  it("parses boosted and raw XP, economy, duration and creatures", () => {
    const parsed = parseSessionAnalyser(`Session: 01:30h
XP Gain: 450,000
Raw XP Gain: 300,000
XP/h: 300,000
Raw XP/h: 200,000
Loot: 125,500
Supplies: 45,000
Balance: 80,500
Killed Monsters:
120x Dragon
35x Dragon Lord`);

    expect(parsed).toEqual({
      durationSeconds: 5_400,
      xpGain: 450_000,
      rawXpGain: 300_000,
      xpPerHour: 300_000,
      rawXpPerHour: 200_000,
      lootValue: 125_500,
      suppliesValue: 45_000,
      profit: 80_500,
      creatures: { Dragon: 120, "Dragon Lord": 35 }
    });
  });

  it("calculates profit when Balance is absent", () => {
    const parsed = parseSessionAnalyser("Loot: 75.000\nSupplies: 20.000");
    expect(parsed.profit).toBe(55_000);
  });

  it("understands abbreviated values", () => {
    expect(parseGameNumber("1.5kk")).toBeNull();
    expect(parseGameNumber("1.5k")).toBe(1_500);
    expect(parseGameNumber("-25,000")).toBe(-25_000);
  });
});
