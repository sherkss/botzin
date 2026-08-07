import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { importCreatureAnimation } from "../../src/knowledge/creature-animation-importer.js";

const animatedGif = Buffer.from(
  "47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024401003b",
  "hex"
);
const singleFrameGif = Buffer.from("47494638396101000100800000000000ffffff2c00000000010001000002024401003b", "hex");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("creature animation importer", () => {
  it("downloads an approved animated GIF and extracts identified PNG frames", async () => {
    const root = await temporaryRoot();
    const fetcher = mockFetcher(animatedGif);
    const result = await importCreatureAnimation({
      root,
      identity: { catalogId: 42, race: "dragon", name: "Dragon", officialImageUrl: "https://static.tibia.com/images/library/dragon.gif" },
      fetcher
    });

    expect(result.cached).toBe(false);
    expect(result.manifest).toMatchObject({ catalogId: 42, race: "dragon", name: "Dragon", frameCount: 2, width: 1, height: 1 });
    expect(await stat(join(root, "dragon", "source.gif"))).toBeTruthy();
    expect(await stat(join(root, "dragon", "frames", "001.png"))).toBeTruthy();
    expect(await stat(join(root, "dragon", "frames", "002.png"))).toBeTruthy();
    expect(JSON.parse(await readFile(join(root, "dragon", "manifest.json"), "utf8"))).toMatchObject({ usage: "local-visual-training" });
  });

  it("returns the cached manifest without downloading the animation again", async () => {
    const root = await temporaryRoot();
    let calls = 0;
    const fetcher = mockFetcher(animatedGif, () => { calls += 1; });
    const options = { root, identity: { catalogId: 42, race: "dragon", name: "Dragon", officialImageUrl: null }, fetcher };
    await importCreatureAnimation(options);
    const result = await importCreatureAnimation(options);
    expect(result.cached).toBe(true);
    expect(calls).toBe(2);
  });

  it("rejects a static GIF because it cannot represent an animation", async () => {
    const root = await temporaryRoot();
    await expect(importCreatureAnimation({
      root,
      identity: { catalogId: 42, race: "dragon", name: "Dragon", officialImageUrl: null },
      fetcher: mockFetcher(singleFrameGif)
    })).rejects.toThrow("não é uma animação");
  });

  it("rejects image downloads outside the approved host", async () => {
    const root = await temporaryRoot();
    const fetcher = async () => new Response(JSON.stringify({ query: { pages: [{ title: "File:Dragon.gif", imageinfo: [{ url: "https://example.com/dragon.gif", mime: "image/gif" }] }] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    await expect(importCreatureAnimation({
      root,
      identity: { catalogId: 42, race: "dragon", name: "Dragon", officialImageUrl: null },
      fetcher: fetcher as typeof fetch
    })).rejects.toThrow("domínio não permitido");
  });
});

function mockFetcher(gif: Buffer, onCall: () => void = () => undefined): typeof fetch {
  return (async (input: string | URL | Request) => {
    onCall();
    const url = String(input);
    if (url.startsWith("https://tibia.fandom.com/api.php")) {
      return new Response(JSON.stringify({ query: { pages: [{ title: "File:Dragon.gif", imageinfo: [{
        url: "https://static.wikia.nocookie.net/tibia/images/e/e0/Dragon.gif",
        descriptionurl: "https://tibia.fandom.com/wiki/File:Dragon.gif",
        mime: "image/gif",
        size: gif.length
      }] }] } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(gif, { status: 200, headers: { "Content-Type": "image/gif", "Content-Length": String(gif.length) } });
  }) as typeof fetch;
}

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "botzin-creature-animation-"));
  temporaryDirectories.push(directory);
  return directory;
}
