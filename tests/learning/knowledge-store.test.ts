import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KnowledgeStore, chunksFor, documentFromMarkdown, markdownFor, parseVtt, type KnowledgeDocument } from "../../src/knowledge/knowledge-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("knowledge store", () => {
  it("parses VTT timestamps, markup and duplicate rolling captions", () => {
    const segments = parseVtt(`WEBVTT

00:00:01.000 --> 00:00:03.500
<c>Antes da hunt confira a vida.</c>

00:00:03.500 --> 00:00:05.000
Antes da hunt confira a vida.

00:00:05.000 --> 00:00:07.000
Leve suprimentos &amp; planeje a saída.
`);

    expect(segments).toEqual([
      { startSeconds: 1, endSeconds: 3.5, text: "Antes da hunt confira a vida." },
      { startSeconds: 5, endSeconds: 7, text: "Leve suprimentos & planeje a saída." }
    ]);
  });

  it("removes overlap from YouTube rolling captions", () => {
    const segments = parseVtt(`WEBVTT

00:00:01.000 --> 00:00:03.000
Sejam todos muito

00:00:03.000 --> 00:00:05.000
Sejam todos muito
<c>bem-vindos ao Tibia</c>

00:00:05.000 --> 00:00:06.000
bem-vindos ao Tibia

00:00:06.000 --> 00:00:08.000
bem-vindos ao Tibia neste guia
`);

    expect(segments.map((segment) => segment.text)).toEqual([
      "Sejam todos muito",
      "bem-vindos ao Tibia",
      "neste guia"
    ]);
  });

  it("generates timestamped Markdown and bounded chunks", () => {
    const document = sampleDocument();
    const markdown = markdownFor(document);
    const chunks = chunksFor(document);

    expect(markdown).toContain("video_id: video-1");
    expect(markdown).toContain("## 00:10–00:15");
    expect(chunks[0]?.url).toContain("t=10s");
    expect(chunks[0]?.reviewed).toBe(true);
    expect(documentFromMarkdown(markdown)).toEqual(document);
  });

  it("indexes and searches accent-insensitively with source evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "botzin-knowledge-"));
    temporaryDirectories.push(directory);
    const store = new KnowledgeStore(directory);
    await store.writeIndex([sampleDocument()]);

    const results = await store.search("suprimentos para cacar");
    const coverage = await store.coverage();

    expect(results[0]?.videoId).toBe("video-1");
    expect(results[0]?.text).toContain("suprimentos");
    expect(coverage).toMatchObject({ indexedDocuments: 1, indexedChunks: 1, reviewedDocuments: 1 });
  });

  it("returns each chunk once even when terms repeat", async () => {
    const directory = await mkdtemp(join(tmpdir(), "botzin-knowledge-"));
    temporaryDirectories.push(directory);
    const store = new KnowledgeStore(directory);
    await store.writeIndex([sampleDocument()]);

    const results = await store.search("hunt hunt hunt");
    expect(results.map((result) => result.id)).toEqual(["video-1:10"]);
  });
});

function sampleDocument(): KnowledgeDocument {
  return {
    videoId: "video-1",
    title: "Preparação para caçar",
    url: "https://www.youtube.com/watch?v=video-1",
    playlistId: "playlist-1",
    language: "pt-BR",
    reviewed: true,
    segments: [
      { startSeconds: 10, endSeconds: 15, text: "Confira vida, mana e suprimentos antes de iniciar a hunt." },
      { startSeconds: 15, endSeconds: 20, text: "Planeje uma rota de saída segura." }
    ]
  };
}
