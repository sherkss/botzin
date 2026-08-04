import { TIBIA_BOOK_TRANSLATIONS } from "./tibia-book-translations.generated.js";
import type { TibiaKnowledgeEntry } from "./tibia-general-knowledge.js";
import { cleanWikiText } from "./tibia-general-knowledge.js";

const API_URL = "https://tibia.fandom.com/api.php";
const CATEGORY = "Category:Book Texts";
const LICENSE_URL = "https://community.fandom.com/wiki/Help:Licensing";

export interface ParsedTibiaBook {
  readonly pageName: string;
  readonly title: string;
  readonly bookTypes: readonly string[];
  readonly location: string;
  readonly libraries: readonly string[];
  readonly author: string;
  readonly blurb: string;
  readonly text: string;
  readonly previousBook: string | null;
  readonly nextBook: string | null;
  readonly relatedPages: readonly string[];
  readonly implemented: string | null;
}

export async function fetchTibiaBookKnowledge(
  fetcher: (url: string) => Promise<unknown> = fetchJson
): Promise<readonly TibiaKnowledgeEntry[]> {
  const members = await categoryMembers(fetcher);
  const entries = await mapConcurrent(members, 8, async (member): Promise<TibiaKnowledgeEntry | null> => {
    const url = apiUrl({ action: "parse", page: member.title, prop: "wikitext|revid", format: "json", formatversion: "2" });
    const payload = object(await fetcher(url));
    const parsed = objectOrNull(payload.parse);
    if (!parsed || typeof parsed.wikitext !== "string") return null;
    const book = parseTibiaBook(member.title, parsed.wikitext);
    if (!book.text) return null;
    const revisionId = integerOrNull(parsed.revid);
    const translation = TIBIA_BOOK_TRANSLATIONS[String(member.pageid)];
    const translationCurrent = Boolean(translation && translation.revisionId === revisionId);
    const sourceUrl = `https://tibia.fandom.com/wiki/${encodeURIComponent(member.title.replaceAll(" ", "_"))}`;
    const portugueseText = translationCurrent ? translation!.textPtBr : "";
    return {
      key: `fandom:book:${member.pageid}`,
      domain: "book",
      name: book.pageName.replace(/\s+\(Book\)$/i, ""),
      summary: translationCurrent && translation!.blurbPtBr ? translation!.blurbPtBr : book.blurb || null,
      content: [
        portugueseText ? `Português (tradução automática):\n${portugueseText}` : "Tradução PT-BR pendente.",
        `English (original):\n${book.text}`,
        book.location ? `Localização: ${book.location}` : ""
      ].filter(Boolean).join("\n\n"),
      metadata: {
        pageName: book.pageName,
        titleEn: book.title,
        titlePtBr: translationCurrent ? translation!.titlePtBr : null,
        textEn: book.text,
        textPtBr: portugueseText || null,
        translationStatus: translationCurrent ? "machine-translated" : "pending",
        translationProvider: translationCurrent ? translation!.provider : null,
        translationGeneratedAt: translationCurrent ? translation!.generatedAt : null,
        translationNotice: "Tradução automática; o texto original em inglês prevalece em caso de dúvida.",
        bookTypes: book.bookTypes,
        location: book.location,
        libraries: book.libraries,
        author: book.author,
        blurbEn: book.blurb,
        previousBook: book.previousBook,
        nextBook: book.nextBook,
        relatedPages: book.relatedPages,
        implemented: book.implemented,
        revisionId,
        license: "CC-BY-SA-3.0",
        licenseUrl: LICENSE_URL,
        attributionUrl: sourceUrl,
        transformations: ["wiki markup removed", "book metadata structured", ...(translationCurrent ? ["machine translated to pt-BR"] : [])]
      },
      sourceUrl,
      sourceUpdatedAt: null,
      trust: "community",
      volatile: true
    };
  });
  const available = entries.filter((entry): entry is TibiaKnowledgeEntry => entry !== null);
  if (available.length < 1_000) throw new Error(`Fandom returned only ${available.length} readable book texts.`);
  return available.sort((left, right) => left.name.localeCompare(right.name));
}

export function parseTibiaBook(pageName: string, wikitext: string): ParsedTibiaBook {
  const fields = infoboxFields(wikitext);
  const cleaned = (field: string): string => cleanBookText(fields[field] ?? "");
  const libraries = Object.keys(fields)
    .filter((field) => /^returnpage\d*$/i.test(field))
    .map(cleaned)
    .filter(Boolean);
  return {
    pageName,
    title: cleaned("title") || pageName.replace(/\s+\(Book\)$/i, ""),
    bookTypes: Object.keys(fields).filter((field) => /^booktype\d*$/i.test(field)).map(cleaned).filter(Boolean),
    location: cleaned("location"),
    libraries,
    author: cleaned("author").replace(/\.$/, ""),
    blurb: cleaned("blurb"),
    text: cleaned("text"),
    previousBook: cleaned("prevbook") || null,
    nextBook: cleaned("nextbook") || null,
    relatedPages: splitLinks(fields.relatedpages ?? ""),
    implemented: cleaned("implemented") || null
  };
}

function infoboxFields(wikitext: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const matches = [...wikitext.matchAll(/^\|\s*([a-z][a-z0-9]*)\s*=\s*/gim)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const start = match.index! + match[0].length;
    const end = matches[index + 1]?.index ?? wikitext.lastIndexOf("}}");
    fields[match[1]!.toLowerCase()] = wikitext.slice(start, end < start ? undefined : end).replace(/\|\|\s*$/, "").trim();
  }
  return fields;
}

function cleanBookText(value: string): string {
  return cleanWikiText(value
    .replace(/<pre[^>]*>/gi, "")
    .replace(/<\/pre>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n"))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLinks(value: string): string[] {
  return [...value.matchAll(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g)].map((match) => match[1]!.trim()).filter(Boolean);
}

async function categoryMembers(fetcher: (url: string) => Promise<unknown>): Promise<Array<{ pageid: number; title: string }>> {
  const members: Array<{ pageid: number; title: string }> = [];
  let continuation: string | null = null;
  do {
    const payload = object(await fetcher(apiUrl({
      action: "query", list: "categorymembers", cmtitle: CATEGORY, cmnamespace: "0", cmlimit: "500",
      ...(continuation ? { cmcontinue: continuation } : {}), format: "json", formatversion: "2"
    })));
    const query = object(payload.query);
    for (const raw of array(query.categorymembers)) {
      const member = object(raw);
      if (typeof member.title === "string" && integerOrNull(member.pageid) !== null) {
        members.push({ pageid: integerOrNull(member.pageid)!, title: member.title });
      }
    }
    const next = objectOrNull(payload.continue);
    continuation = next && typeof next.cmcontinue === "string" ? next.cmcontinue : null;
  } while (continuation);
  return members;
}

function apiUrl(parameters: Record<string, string>): string {
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

async function fetchJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "BotzinKnowledgeSync/0.1 (Tibia book catalog)" } });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 300));
    }
  }
  throw lastError;
}

async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await mapper(values[index]!);
    }
  }));
  return results;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object response.");
  return value as Record<string, unknown>;
}
function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function integerOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
