export const TIBIA_VOCATIONS = ["druid", "knight", "paladin", "sorcerer", "monk"] as const;

export type TibiaVocation = (typeof TIBIA_VOCATIONS)[number];

export interface TibiaSpellCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly words: string | null;
  readonly group: "attack" | "healing" | "support";
  readonly type: "instant" | "rune";
  readonly requiredLevel: number | null;
  readonly manaCost: number | null;
  readonly manaText: string;
  readonly premium: boolean;
  readonly vocations: readonly TibiaVocation[];
  readonly description: string | null;
  readonly cooldownSeconds: number | null;
  readonly groupCooldownSeconds: number | null;
  readonly soulPoints: number | null;
  readonly amount: number | null;
  readonly runeVocations: readonly TibiaVocation[];
  readonly runeGroup: string | null;
  readonly runeRequiredLevel: number | null;
  readonly runeMagicLevel: number | null;
}

export type TibiaRuneDetail = Pick<TibiaSpellCatalogEntry, "description" | "cooldownSeconds" | "groupCooldownSeconds" |
  "soulPoints" | "amount" | "runeVocations" | "runeGroup" | "runeRequiredLevel" | "runeMagicLevel">;

const OFFICIAL_SPELLS_URL = "https://www.tibia.com/library/?subtopic=spells";

export async function fetchOfficialSpellCatalog(
  fetchPage: (url: string) => Promise<string> = fetchHtml
): Promise<readonly TibiaSpellCatalogEntry[]> {
  const allSpells = parseSpellTable(await fetchPage(OFFICIAL_SPELLS_URL));
  if (allSpells.length < 150) {
    throw new Error(`Official Tibia spell table returned only ${allSpells.length} entries.`);
  }

  const vocationIds = new Map<string, Set<TibiaVocation>>();
  await Promise.all(TIBIA_VOCATIONS.map(async (vocation) => {
    const officialName = `${vocation[0]?.toUpperCase()}${vocation.slice(1)}`;
    const html = await fetchPage(`${OFFICIAL_SPELLS_URL}&vocation=${officialName}`);
    const spells = parseSpellTable(html);
    if (spells.length === 0) {
      throw new Error(`Official Tibia spell filter returned no entries for ${officialName}.`);
    }
    for (const spell of spells) {
      const vocations = vocationIds.get(spell.id) ?? new Set<TibiaVocation>();
      vocations.add(vocation);
      vocationIds.set(spell.id, vocations);
    }
  }));

  const catalog = allSpells.map((spell) => {
    const vocations = TIBIA_VOCATIONS.filter((vocation) => vocationIds.get(spell.id)?.has(vocation));
    if (vocations.length === 0) {
      throw new Error(`No vocation found for official Tibia spell ${spell.name}.`);
    }
    return { ...spell, vocations, description: null, cooldownSeconds: null, groupCooldownSeconds: null,
      soulPoints: null, amount: null, runeVocations: [], runeGroup: null, runeRequiredLevel: null, runeMagicLevel: null };
  });
  const runeDetails = new Map<string, TibiaRuneDetail>();
  const communitySpells = fetchPage === fetchHtml ? await communitySpellIndex() : new Map<string, number>();
  await concurrentMap(catalog.filter((spell) => spell.type === "rune"), 2, async (spell) => {
    const communityId = communitySpells.get(normalizeRuneName(spell.name));
    if (communityId !== undefined) runeDetails.set(spell.id, parseCommunitySpellDetail(await fetchJson(`https://tibiadata.bytewizards.de/api/v1/spells/${communityId}`), spell));
    else runeDetails.set(spell.id, parseSpellDetail(await fetchPage(`${OFFICIAL_SPELLS_URL}&spell=${spell.id}`)));
  });
  return catalog.map((spell) => spell.type === "rune" ? { ...spell, ...runeDetails.get(spell.id) } : spell);
}

export function parseCommunitySpellDetail(value: unknown, spell: Pick<TibiaSpellCatalogEntry, "requiredLevel" | "vocations">): TibiaRuneDetail {
  const response = objectValue(value);
  const infobox = objectValue(objectValue(response.structuredData).infobox);
  const fields = objectValue(infobox.fields);
  return {
    description: cleanWiki(String(fields.librarytext ?? infobox.effect ?? fields.effect ?? "")) || null,
    cooldownSeconds: nullableNumber(infobox.cooldown ?? fields.cooldown),
    groupCooldownSeconds: nullableNumber(infobox.cooldownGroup ?? fields.cooldowngroup),
    soulPoints: nullableNumber(infobox.soul ?? fields.soul),
    amount: nullableNumber(fields.amount),
    runeVocations: [...TIBIA_VOCATIONS],
    runeGroup: typeof fields.runegroup === "string" ? fields.runegroup.toLowerCase() : null,
    runeRequiredLevel: spell.requiredLevel,
    runeMagicLevel: null
  };
}

async function communitySpellIndex(): Promise<Map<string, number>> {
  const list = await fetchJson("https://tibiadata.bytewizards.de/api/v1/spells/list");
  const result = new Map<string, number>();
  if (!Array.isArray(list)) return result;
  for (const value of list) {
    const item = objectValue(value);
    if (typeof item.name === "string" && Number.isFinite(Number(item.id))) result.set(normalizeRuneName(item.name), Number(item.id));
  }
  return result;
}

function normalizeRuneName(value: string): string { return value.toLowerCase().replace(/\s+rune$/, "").trim(); }
function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function nullableNumber(value: unknown): number | null { const number = Number(value); return value !== null && value !== "" && Number.isFinite(number) ? number : null; }
function cleanWiki(value: string): string { return value.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1").replace(/'{2,}/g, "").replace(/\s+/g, " ").trim(); }
async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { "user-agent": "botzin-spell-catalog/0.1" } });
  if (!response.ok) throw new Error(`Could not fetch ${url}: HTTP ${response.status}.`);
  return response.json();
}

export function parseSpellTable(html: string): readonly Omit<TibiaSpellCatalogEntry, "vocations">[] {
  const rowPattern = /<TR BGCOLOR=#[A-F0-9]+><TD><A HREF="[^"]*spell=([a-z0-9]+)[^"]*">([^<]+)<\/A>(?: \((.*?)\))?<\/TD><TD>([^<]+)<\/TD><TD>([^<]+)<\/TD><TD>([^<]+)<\/TD><TD>([^<]+)<\/TD><TD>([^<]+)<\/TD><\/TR>/gi;
  const spells: Array<Omit<TibiaSpellCatalogEntry, "vocations">> = [];

  for (const match of html.matchAll(rowPattern)) {
    const group = decodeHtml(match[4] ?? "").toLowerCase();
    const type = decodeHtml(match[5] ?? "").toLowerCase();
    const levelText = decodeHtml(match[6] ?? "");
    const manaText = decodeHtml(match[7] ?? "");
    if (!isSpellGroup(group) || !isSpellType(type)) continue;

    spells.push({
      id: match[1] ?? "",
      name: decodeHtml(match[2] ?? ""),
      words: match[3] ? decodeHtml(match[3]).trim() : null,
      group,
      type,
      requiredLevel: parseOfficialNumber(levelText),
      manaCost: parseOfficialNumber(manaText),
      manaText,
      premium: decodeHtml(match[8] ?? "").toLowerCase() === "yes"
      , description: null, cooldownSeconds: null, groupCooldownSeconds: null, soulPoints: null, amount: null,
      runeVocations: [], runeGroup: null, runeRequiredLevel: null, runeMagicLevel: null
    });
  }

  return spells;
}

export function parseSpellDetail(html: string): TibiaRuneDetail {
  const marker = html.indexOf("Rune Information");
  const spellFields = parseFields(marker >= 0 ? html.slice(0, marker) : html);
  const runeFields = parseFields(marker >= 0 ? html.slice(marker) : "");
  const cooldown = spellFields.get("cooldown") ?? "";
  const descriptionMatch = html.match(/<H2[^>]*>[^<]+<\/H2>([\s\S]*?)<BR>\s*<div class="TableContainer"/i);
  return {
    description: descriptionMatch ? stripHtml(descriptionMatch[1] ?? "") || null : null,
    cooldownSeconds: seconds(cooldown.match(/^(\d+(?:\.\d+)?)s/i)?.[1]),
    groupCooldownSeconds: seconds(cooldown.match(/Group:\s*(\d+(?:\.\d+)?)s/i)?.[1]),
    soulPoints: officialFieldNumber(spellFields.get("soul points")),
    amount: officialFieldNumber(spellFields.get("amount")),
    runeVocations: parseVocations(runeFields.get("vocation") ?? ""),
    runeGroup: runeFields.get("group")?.toLowerCase() ?? null,
    runeRequiredLevel: officialFieldNumber(runeFields.get("exp lvl")),
    runeMagicLevel: officialFieldNumber(runeFields.get("mag lvl"))
  };
}

function parseFields(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const match of html.matchAll(/<TR[^>]*><TD[^>]*>([^<]+):<\/TD><TD[^>]*>([\s\S]*?)<\/TD><\/TR>/gi)) {
    fields.set(decodeHtml(match[1] ?? "").trim().toLowerCase(), stripHtml(match[2] ?? ""));
  }
  return fields;
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<BR\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function officialFieldNumber(value: string | undefined): number | null {
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

function seconds(value: string | undefined): number | null { return value === undefined ? null : Number(value); }

function parseVocations(value: string): TibiaVocation[] {
  const normalized = value.toLowerCase();
  return TIBIA_VOCATIONS.filter((vocation) => normalized.includes(vocation));
}

async function concurrentMap<T>(values: readonly T[], concurrency: number, task: (value: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) { const index = cursor++; await task(values[index]!); }
  }));
}

async function fetchHtml(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, { headers: {
      "user-agent": "Mozilla/5.0 (compatible; botzin-spell-catalog/0.1; educational)",
      accept: "text/html,application/xhtml+xml"
    } });
    if (response.ok) return response.text();
    if (response.status !== 403 && response.status !== 429 || attempt === 5) throw new Error(`Could not fetch ${url}: HTTP ${response.status}.`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  throw new Error(`Could not fetch ${url}.`);
}

function parseOfficialNumber(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function isSpellGroup(value: string): value is TibiaSpellCatalogEntry["group"] {
  return value === "attack" || value === "healing" || value === "support";
}

function isSpellType(value: string): value is TibiaSpellCatalogEntry["type"] {
  return value === "instant" || value === "rune";
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
