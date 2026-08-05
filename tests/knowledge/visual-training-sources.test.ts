import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadExistingVideoSources } from "../../src/knowledge/visual-training-sources.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("existing visual training sources", () => {
  it("loads and deduplicates previously downloaded YouTube metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "botzin-existing-sources-"));
    directories.push(root);
    await mkdir(join(root, "playlist"), { recursive: true });
    const info = { id: "AZnQORbwiwI", title: "EK Hunt", webpage_url: "https://youtube.com/watch?v=AZnQORbwiwI" };
    await writeFile(join(root, "playlist", "001-AZnQORbwiwI.info.json"), JSON.stringify(info));
    await writeFile(join(root, "playlist", "002-AZnQORbwiwI.info.json"), JSON.stringify(info));
    await writeFile(join(root, "playlist", "003-secondvideo.info.json"), JSON.stringify({ id: "secondvideo", title: "RP Hunt" }));

    const sources = await loadExistingVideoSources(root);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toEqual(info);
    expect(sources[1]?.webpage_url).toBe("https://www.youtube.com/watch?v=secondvideo");
  });
});
