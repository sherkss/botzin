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
}

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

  return allSpells.map((spell) => {
    const vocations = TIBIA_VOCATIONS.filter((vocation) => vocationIds.get(spell.id)?.has(vocation));
    if (vocations.length === 0) {
      throw new Error(`No vocation found for official Tibia spell ${spell.name}.`);
    }
    return { ...spell, vocations };
  });
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
    });
  }

  return spells;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "botzin-spell-catalog/0.1 (+local educational project)" }
  });
  if (!response.ok) throw new Error(`Could not fetch ${url}: HTTP ${response.status}.`);
  return response.text();
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
