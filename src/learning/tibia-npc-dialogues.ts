import type { TibiaKnowledgeEntry } from "./tibia-general-knowledge.js";
import { cleanWikiText } from "./tibia-general-knowledge.js";

export interface NpcDialogueTurn {
  readonly sequence: number;
  readonly playerText: string;
  readonly keywords: readonly string[];
  readonly conditions: readonly string[];
  readonly npc: string;
  readonly response: string;
}

export interface ParsedNpcTranscript {
  readonly npc: string;
  readonly turns: readonly NpcDialogueTurn[];
  readonly searchableText: string;
}

const API_URL = "https://tibia.fandom.com/api.php";
const LICENSE_URL = "https://community.fandom.com/wiki/Help:Licensing";

export async function fetchTibiaNpcDialogueKnowledge(
  fetcher: (url: string) => Promise<unknown> = fetchJson
): Promise<readonly TibiaKnowledgeEntry[]> {
  const members = await categoryMembers(fetcher);
  const entries = await mapConcurrent(members, 8, async (member): Promise<TibiaKnowledgeEntry | null> => {
    const transcriptTitle = `${member.title}/Transcripts`;
    const url = apiUrl({ action: "parse", page: transcriptTitle, prop: "wikitext|revid", format: "json", formatversion: "2" });
    const payload = object(await fetcher(url));
    const parsed = objectOrNull(payload.parse);
    if (!parsed || typeof parsed.wikitext !== "string") return null;
    const transcript = parseNpcTranscript(member.title, parsed.wikitext);
    if (transcript.turns.length === 0) return null;
    const revisionId = integerOrNull(parsed.revid);
    const sourceUrl = `https://tibia.fandom.com/wiki/${encodeURIComponent(transcriptTitle.replaceAll(" ", "_"))}`;
    return {
      key: `fandom:npc-dialogue:${member.pageid}`,
      domain: "npc-dialogue" as const,
      name: `${member.title} — diálogos`,
      summary: `${transcript.turns.length} interações documentadas com ${member.title}.`,
      content: transcript.searchableText,
      metadata: {
        npc: member.title,
        transcriptTitle,
        revisionId,
        turns: transcript.turns,
        license: "CC-BY-SA-3.0",
        licenseUrl: LICENSE_URL,
        attributionUrl: sourceUrl,
        transformations: ["wiki markup removed", "dialogue turns and keywords structured"]
      },
      sourceUrl,
      sourceUpdatedAt: null,
      trust: "community" as const,
      volatile: true
    } satisfies TibiaKnowledgeEntry;
  });
  const available = entries.filter((entry): entry is TibiaKnowledgeEntry => entry !== null);
  if (available.length < 350) throw new Error(`Fandom returned only ${available.length} NPC transcripts.`);
  return available.sort((left, right) => left.name.localeCompare(right.name));
}

export function parseNpcTranscript(npc: string, wikitext: string): ParsedNpcTranscript {
  const normalized = wikitext
    .replace(/^\s*\{\{Infobox Transcript\|/i, "")
    .replace(/\}\}\s*$/, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/\r/g, "");
  const lines = normalized.split("\n").map((line) => cleanWikiText(line).trim()).filter(Boolean);
  const turns: NpcDialogueTurn[] = [];
  let pending: { playerText: string; keywords: string[]; conditions: string[] } | null = null;

  for (const line of lines) {
    const player = line.match(/^(?:Player|Jogador)\s*:\s*(.+)$/i);
    if (player) {
      const playerText = player[1]!.trim();
      pending = { playerText, keywords: dialogueKeywords(playerText), conditions: dialogueConditions(playerText) };
      continue;
    }
    if (!pending) continue;
    const response = line.match(/^([^:]{1,120})\s*:\s*(.+)$/);
    if (!response) continue;
    const speaker = response[1]!.trim();
    if (speaker.toLowerCase() === "player" || speaker.toLowerCase() === "jogador") continue;
    turns.push({
      sequence: turns.length + 1,
      playerText: pending.playerText,
      keywords: pending.keywords,
      conditions: pending.conditions,
      npc: speaker || npc,
      response: response[2]!.trim()
    });
    pending = null;
  }

  return {
    npc,
    turns,
    searchableText: turns.map((turn) => `${turn.npc} | jogador: ${turn.playerText} | resposta: ${turn.response}`).join("\n")
  };
}

function dialogueKeywords(playerText: string): string[] {
  const withoutConditions = playerText.replace(/\([^)]*\)/g, " ").trim();
  if (!withoutConditions || /^(anything|nothing)$/i.test(withoutConditions)) return [];
  return [...new Set(withoutConditions
    .split(/\s+(?:or|ou)\s+|\s*\/\s*|\s*,\s*/i)
    .map((keyword) => keyword.replace(/^['"]|['"]$/g, "").trim().toLowerCase())
    .filter((keyword) => keyword.length > 0 && keyword.length <= 100))];
}

function dialogueConditions(playerText: string): string[] {
  return [...playerText.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]!.trim()).filter(Boolean);
}

async function categoryMembers(fetcher: (url: string) => Promise<unknown>): Promise<Array<{ pageid: number; title: string }>> {
  const members: Array<{ pageid: number; title: string }> = [];
  let continuation: string | null = null;
  do {
    const parameters: Record<string, string> = {
      action: "query", list: "categorymembers", cmtitle: "Category:NPCs with Transcripts",
      cmnamespace: "0", cmlimit: "500", format: "json", formatversion: "2"
    };
    if (continuation) parameters.cmcontinue = continuation;
    const payload = object(await fetcher(apiUrl(parameters)));
    const query = object(payload.query);
    for (const item of array(query.categorymembers)) {
      const member = object(item);
      const pageid = integerOrNull(member.pageid);
      if (pageid !== null && typeof member.title === "string") members.push({ pageid, title: member.title });
    }
    continuation = objectOrNull(payload.continue) && typeof object(payload.continue).cmcontinue === "string"
      ? String(object(payload.continue).cmcontinue)
      : null;
  } while (continuation);
  return members;
}

function apiUrl(parameters: Readonly<Record<string, string>>): string {
  return `${API_URL}?${new URLSearchParams(parameters)}`;
}

async function fetchJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "BotzinKnowledge/0.1 (local educational project)", accept: "application/json" } });
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status} for ${url}`);
      if (response.status < 500 && response.status !== 429) throw lastError;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not fetch ${url}`);
}

async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(values.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      result[index] = await mapper(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected API object.");
  return value as Record<string, unknown>;
}
function objectOrNull(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("Expected API array."); return value; }
function integerOrNull(value: unknown): number | null { const number = Number(value); return Number.isSafeInteger(number) ? number : null; }
