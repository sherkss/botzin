import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { importItemAsset } from "../../src/knowledge/item-asset-importer.js";

const temporaryDirectories: string[] = [];
let visibleWebp: Buffer;
let transparentWebp: Buffer;

beforeAll(async () => {
  visibleWebp = await solidWebp({ r: 200, g: 30, b: 30, alpha: 1 });
  transparentWebp = await solidWebp({ r: 0, g: 0, b: 0, alpha: 0 });
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("item asset importer", () => {
  it("downloads the sprite of an item and stores a PNG for the training pipeline", async () => {
    const root = await temporaryRoot();
    const result = await importItemAsset({
      root,
      identity: { sourceId: 1342, name: "25 Years Backpack", assetId: 3633, categorySlug: "party-items" },
      fetcher: mockFetcher(visibleWebp)
    });

    expect(result.cached).toBe(false);
    expect(result.manifest).toMatchObject({
      sourceId: 1342,
      name: "25 Years Backpack",
      assetId: 3633,
      categorySlug: "party-items",
      width: 32,
      height: 32,
      usage: "local-visual-training",
      files: ["sprite.png"]
    });
    expect(await stat(join(root, "1342", "sprite.png"))).toBeTruthy();
    expect(await stat(join(root, "1342", "source.webp"))).toBeTruthy();
    expect(JSON.parse(await readFile(join(root, "1342", "manifest.json"), "utf8"))).toMatchObject({ sourceId: 1342 });
  });

  it("resolves the asset id from the item detail endpoint when it is unknown", async () => {
    const root = await temporaryRoot();
    const requested: string[] = [];
    const result = await importItemAsset({
      root,
      identity: { sourceId: 1342, name: "25 Years Backpack" },
      fetcher: mockFetcher(visibleWebp, (url) => requested.push(url))
    });

    expect(result.manifest.assetId).toBe(3633);
    expect(requested[0]).toBe("https://tibiadata.bytewizards.de/api/v1/items/1342");
  });

  it("returns the cached manifest without downloading the sprite again", async () => {
    const root = await temporaryRoot();
    let calls = 0;
    const options = {
      root,
      identity: { sourceId: 1342, name: "25 Years Backpack", assetId: 3633 },
      fetcher: mockFetcher(visibleWebp, () => { calls += 1; })
    };
    await importItemAsset(options);
    const result = await importItemAsset(options);

    expect(result.cached).toBe(true);
    expect(calls).toBe(1);
  });

  it("rejects a fully transparent sprite because it cannot be labelled", async () => {
    const root = await temporaryRoot();
    await expect(importItemAsset({
      root,
      identity: { sourceId: 4226, name: "200 Theons", assetId: 3716 },
      fetcher: mockFetcher(transparentWebp)
    })).rejects.toThrow("não possui pixels visíveis");
  });

  it("rejects a download that is not a WebP file", async () => {
    const root = await temporaryRoot();
    const fetcher = (async () => new Response(Buffer.from("not an image"), {
      status: 200,
      headers: { "Content-Type": "image/webp" }
    })) as typeof fetch;

    await expect(importItemAsset({
      root,
      identity: { sourceId: 1342, name: "25 Years Backpack", assetId: 3633 },
      fetcher
    })).rejects.toThrow("assinatura WebP");
  });
});

function mockFetcher(sprite: Buffer, onCall: (url: string) => void = () => undefined): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    onCall(url);
    if (url.startsWith("https://tibiadata.bytewizards.de/api/v1/items/")) {
      return new Response(JSON.stringify({
        id: 1342,
        name: "25 Years Backpack",
        images: [{ assetId: 3633, storageKey: "items/1342/primary.webp", mimeType: "image/webp" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(sprite, {
      status: 200,
      headers: { "Content-Type": "image/webp", "Content-Length": String(sprite.length) }
    });
  }) as typeof fetch;
}

async function solidWebp(background: { r: number; g: number; b: number; alpha: number }): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 4, background } }).webp({ lossless: true }).toBuffer();
}

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "botzin-item-asset-"));
  temporaryDirectories.push(directory);
  return directory;
}
