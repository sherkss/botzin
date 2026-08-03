import { describe, expect, it } from "vitest";
import { BASIC_GAME_KNOWLEDGE } from "../../src/learning/basic-game-knowledge.js";

describe("basic game knowledge seed", () => {
  it("catalogs both beginner playlists and their videos", () => {
    const playlists = BASIC_GAME_KNOWLEDGE.filter((source) => source.metadata.kind === "playlist");
    const videos = BASIC_GAME_KNOWLEDGE.filter((source) => source.metadata.kind === "video");

    expect(playlists).toHaveLength(2);
    expect(videos).toHaveLength(31);
    expect(new Set(videos.map((source) => source.metadata.videoId)).size).toBe(31);
  });

  it("only marks the curated baseline as ready", () => {
    const ready = BASIC_GAME_KNOWLEDGE.filter((source) => source.status === "ready");
    const remote = BASIC_GAME_KNOWLEDGE.filter((source) => source.uri !== null);

    expect(ready).toHaveLength(1);
    expect(ready[0]?.metadata.kind).toBe("curated-baseline");
    expect(remote.every((source) => source.status === "pending")).toBe(true);
  });

  it("has stable unique seed keys", () => {
    const keys = BASIC_GAME_KNOWLEDGE.map((source) => source.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
