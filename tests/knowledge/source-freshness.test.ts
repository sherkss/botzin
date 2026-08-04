import { describe, expect, it } from "vitest";
import { classifySourceFreshness, extractGameVersion, freshnessWarning } from "../../src/knowledge/source-freshness.js";

describe("video source freshness", () => {
  it("marks an older client version as legacy", () => {
    expect(classifySourceFreshness({ gameVersion: "12.90", currentGameVersion: "15.30" })).toBe("legacy");
    expect(freshnessWarning("legacy", "12.90")).toContain("XP, profit, dano");
  });

  it("marks the configured client version as current", () => {
    expect(classifySourceFreshness({ gameVersion: "15.30", currentGameVersion: "15.30" })).toBe("current");
  });

  it("uses the configured update date when the title has no version", () => {
    expect(classifySourceFreshness({ publishedAt: "2022-05-10", legacyBefore: "2026-06-01" })).toBe("legacy");
    expect(classifySourceFreshness({ publishedAt: "2026-07-10", legacyBefore: "2026-06-01" })).toBe("current");
  });

  it("extracts the official client version from TibiaHunt titles", () => {
    expect(extractGameVersion("EK 209 Hunt Solo Draken Walls - Tibia Hunt [15.25]")).toBe("15.25");
  });
});
