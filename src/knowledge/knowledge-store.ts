import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

export interface TranscriptSegment {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly text: string;
}

export interface KnowledgeDocument {
  readonly videoId: string;
  readonly title: string;
  readonly url: string;
  readonly playlistId: string | null;
  readonly language: string;
  readonly reviewed: boolean;
  readonly segments: readonly TranscriptSegment[];
}

export interface KnowledgeChunk {
  readonly id: string;
  readonly videoId: string;
  readonly title: string;
  readonly url: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly text: string;
  readonly reviewed: boolean;
}

export interface KnowledgeIndex {
  readonly version: 1;
  readonly generatedAt: string;
  readonly documents: number;
  readonly chunks: readonly KnowledgeChunk[];
}

export interface KnowledgeSearchResult extends KnowledgeChunk {
  readonly score: number;
}

export interface KnowledgeCoverage {
  readonly indexedDocuments: number;
  readonly indexedChunks: number;
  readonly reviewedDocuments: number;
  readonly generatedAt: string | null;
}

const INDEX_FILENAME = "knowledge-index.json";
const MAX_CHUNK_CHARACTERS = 2_400;
const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e", "em", "eu", "na", "nas",
  "no", "nos", "o", "os", "ou", "para", "por", "que", "se", "sem", "um", "uma"
]);

export function parseVtt(input: string): TranscriptSegment[] {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/);
  const segments: TranscriptSegment[] = [];
  let previousCue = "";

  for (let index = 0; index < lines.length; index += 1) {
    const timing = lines[index]?.match(/^(\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+(\d{2}:)?\d{2}:\d{2}[.,]\d{3}/);
    if (!timing) continue;
    const [startText, endText] = lines[index]!.split(" --> ").map((part) => part.trim().split(" ")[0]!);
    const text: string[] = [];
    index += 1;
    while (index < lines.length && lines[index]?.trim()) {
      text.push(lines[index]!.replace(/<[^>]+>/g, ""));
      index += 1;
    }
    const cleaned = decodeEntities(text.join(" ").replace(/\s+/g, " ").trim());
    const novelText = novelCaptionText(previousCue, cleaned);
    previousCue = cleaned;
    if (!novelText) continue;
    segments.push({ startSeconds: parseTimestamp(startText), endSeconds: parseTimestamp(endText), text: novelText });
  }

  return segments;
}

function novelCaptionText(previous: string, current: string): string {
  if (!current || previous === current || previous.includes(current)) return "";
  const maximum = Math.min(previous.length, current.length);
  for (let overlap = maximum; overlap > 0; overlap -= 1) {
    if (previous.endsWith(current.slice(0, overlap))) return current.slice(overlap).trim();
  }
  return current;
}

export function chunksFor(document: KnowledgeDocument): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  let pending: TranscriptSegment[] = [];
  let length = 0;

  const flush = (): void => {
    if (pending.length === 0) return;
    const first = pending[0]!;
    const last = pending.at(-1)!;
    chunks.push({
      id: `${document.videoId}:${Math.floor(first.startSeconds)}`,
      videoId: document.videoId,
      title: document.title,
      url: timestampUrl(document.url, first.startSeconds),
      startSeconds: first.startSeconds,
      endSeconds: last.endSeconds,
      text: pending.map((segment) => segment.text).join(" "),
      reviewed: document.reviewed
    });
    pending = [];
    length = 0;
  };

  for (const segment of document.segments) {
    if (length + segment.text.length > MAX_CHUNK_CHARACTERS) flush();
    pending.push(segment);
    length += segment.text.length + 1;
  }
  flush();
  return chunks;
}

export function markdownFor(document: KnowledgeDocument): string {
  const header = [
    "---",
    `video_id: ${document.videoId}`,
    `titulo: ${JSON.stringify(document.title)}`,
    `url: ${document.url}`,
    `playlist_id: ${document.playlistId ?? ""}`,
    `idioma: ${document.language}`,
    `revisado: ${document.reviewed}`,
    "---",
    ""
  ];
  const body = document.segments.map((segment) =>
    `## ${formatTimestamp(segment.startSeconds)}–${formatTimestamp(segment.endSeconds)}\n\n${segment.text}\n`
  );
  return [...header, ...body].join("\n");
}

export function documentFromMarkdown(input: string): KnowledgeDocument | null {
  const match = input.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const metadata = new Map<string, string>();
  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) metadata.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  const videoId = metadata.get("video_id");
  if (!videoId) return null;
  const segments: TranscriptSegment[] = [];
  const sectionPattern = /^##\s+([0-9:.]+)–([0-9:.]+)\s*\r?\n\r?\n([\s\S]*?)(?=^##\s+|\s*$)/gm;
  for (const section of match[2]!.matchAll(sectionPattern)) {
    const text = section[3]?.trim().replace(/\s+/g, " ");
    if (text) segments.push({ startSeconds: parseTimestamp(section[1]!), endSeconds: parseTimestamp(section[2]!), text });
  }
  return {
    videoId,
    title: parseJsonString(metadata.get("titulo")) ?? videoId,
    url: metadata.get("url") ?? "",
    playlistId: metadata.get("playlist_id") || null,
    language: metadata.get("idioma") ?? "pt-BR",
    reviewed: metadata.get("revisado") === "true",
    segments
  };
}

export class KnowledgeStore {
  constructor(private readonly knowledgeDir: string) {}

  async saveDocument(document: KnowledgeDocument): Promise<string> {
    const reviewedDir = join(this.knowledgeDir, "reviewed");
    await mkdir(reviewedDir, { recursive: true });
    const path = join(reviewedDir, `${safeName(document.videoId)}.md`);
    await writeFile(path, markdownFor(document), "utf8");
    return path;
  }

  async writeIndex(documents: readonly KnowledgeDocument[]): Promise<KnowledgeIndex> {
    await mkdir(this.knowledgeDir, { recursive: true });
    const index: KnowledgeIndex = {
      version: 1,
      generatedAt: new Date().toISOString(),
      documents: documents.length,
      chunks: documents.flatMap(chunksFor)
    };
    await writeFile(join(this.knowledgeDir, INDEX_FILENAME), JSON.stringify(index, null, 2), "utf8");
    return index;
  }

  async readDocuments(): Promise<KnowledgeDocument[]> {
    const paths = await listFilesRecursive(join(this.knowledgeDir, "reviewed"), ".md");
    const documents = await Promise.all(paths.map(async (path) => documentFromMarkdown(await readFile(path, "utf8"))));
    return documents.filter((document): document is KnowledgeDocument => document !== null && document.segments.length > 0);
  }

  async readIndex(): Promise<KnowledgeIndex | null> {
    try {
      const parsed = JSON.parse(await readFile(join(this.knowledgeDir, INDEX_FILENAME), "utf8")) as KnowledgeIndex;
      return parsed.version === 1 && Array.isArray(parsed.chunks) ? parsed : null;
    } catch {
      return null;
    }
  }

  async coverage(): Promise<KnowledgeCoverage> {
    const index = await this.readIndex();
    if (!index) return { indexedDocuments: 0, indexedChunks: 0, reviewedDocuments: 0, generatedAt: null };
    return {
      indexedDocuments: index.documents,
      indexedChunks: index.chunks.length,
      reviewedDocuments: new Set(index.chunks.filter((chunk) => chunk.reviewed).map((chunk) => chunk.videoId)).size,
      generatedAt: index.generatedAt
    };
  }

  async search(query: string, limit = 5): Promise<KnowledgeSearchResult[]> {
    const terms = tokenize(query);
    if (terms.length === 0) return [];
    const index = await this.readIndex();
    if (!index) return [];

    return index.chunks
      .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, terms) }))
      .filter((chunk) => chunk.score > 0)
      .sort((left, right) => right.score - left.score || left.startSeconds - right.startSeconds)
      .slice(0, Math.max(1, Math.min(limit, 20)));
  }
}

export async function listFilesRecursive(root: string, extension: string): Promise<string[]> {
  try {
    const entries = await readdir(root);
    const files: string[] = [];
    for (const entry of entries) {
      const path = join(root, entry);
      const fileStat = await stat(path);
      if (fileStat.isDirectory()) files.push(...await listFilesRecursive(path, extension));
      else if (basename(path).toLowerCase().endsWith(extension.toLowerCase())) files.push(path);
    }
    return files;
  } catch {
    return [];
  }
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/[^a-z0-9]+/).filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function scoreChunk(chunk: KnowledgeChunk, terms: readonly string[]): number {
  const title = normalizeText(chunk.title);
  const text = normalizeText(chunk.text);
  let score = chunk.reviewed ? 0.25 : 0;
  let matchedTerms = 0;
  for (const term of terms) {
    let matched = false;
    if (title.includes(term)) {
      score += 4;
      matched = true;
    }
    const matches = text.match(new RegExp(`\\b${escapeRegExp(term)}`, "g"));
    score += Math.min(matches?.length ?? 0, 8);
    if ((matches?.length ?? 0) > 0) matched = true;
    if (matched) matchedTerms += 1;
  }
  if (matchedTerms === terms.length) score += terms.length * 3;
  return score;
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function parseTimestamp(value: string): number {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return parts[0]! * 60 + parts[1]!;
}

function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  return hours > 0
    ? [hours, minutes, remaining].map((part) => String(part).padStart(2, "0")).join(":")
    : [minutes, remaining].map((part) => String(part).padStart(2, "0")).join(":");
}

function timestampUrl(url: string, seconds: number): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("t", `${Math.floor(seconds)}s`);
    return parsed.toString();
  } catch {
    return url;
  }
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseJsonString(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}
