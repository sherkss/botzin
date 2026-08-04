export interface TibiaCreatureCatalogEntry {
  readonly race: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly description: string;
  readonly behaviour: string;
  readonly hitpoints: number;
  readonly experience: number;
  readonly immune: readonly string[];
  readonly strong: readonly string[];
  readonly weakness: readonly string[];
  readonly healed: readonly string[];
  readonly canBeParalysed: boolean;
  readonly canBeSummoned: boolean;
  readonly summonedMana: number;
  readonly canBeConvinced: boolean;
  readonly convincedMana: number;
  readonly seesInvisible: boolean;
  readonly lootable: boolean;
  readonly loot: readonly string[];
}

export interface TibiaItemCatalogEntry {
  readonly sourceId: number;
  readonly name: string;
  readonly categorySlug: string | null;
  readonly categoryName: string | null;
  readonly primaryType: string | null;
  readonly secondaryType: string | null;
  readonly objectClass: string | null;
  readonly wikiUrl: string;
  readonly imagePath: string | null;
  readonly sourceUpdatedAt: string;
}

interface OfficialCreatureOverviewResponse {
  creatures?: { creature_list?: Array<{ race?: unknown }> };
}

interface OfficialCreatureDetailResponse {
  creature?: Record<string, unknown>;
}

interface ItemPageResponse {
  page?: unknown;
  pageSize?: unknown;
  totalCount?: unknown;
  items?: unknown;
}

const OFFICIAL_CREATURES_URL = "https://api.tibiadata.com/v4/creatures";
const ITEM_API_URL = "https://tibiadata.bytewizards.de/api/v1/items";

export async function fetchOfficialCreatureCatalog(
  fetchJson: (url: string) => Promise<unknown> = fetchJsonWithRetry,
  concurrency = 12
): Promise<readonly TibiaCreatureCatalogEntry[]> {
  const overview = await fetchJson(OFFICIAL_CREATURES_URL) as OfficialCreatureOverviewResponse;
  const races = (overview.creatures?.creature_list ?? [])
    .map((entry) => stringValue(entry.race))
    .filter((race): race is string => Boolean(race));
  if (races.length < 600) throw new Error(`Official creature catalog returned only ${races.length} entries.`);

  const details = await concurrentMap(races, concurrency, async (race) => {
    const response = await fetchJson(`${OFFICIAL_CREATURES_URL.replace(/s$/, "")}/${encodeURIComponent(race)}`) as OfficialCreatureDetailResponse;
    return parseOfficialCreature(response.creature, race);
  });
  return details.sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchTibiaItemCatalog(
  fetchJson: (url: string) => Promise<unknown> = fetchJsonWithRetry,
  concurrency = 6
): Promise<readonly TibiaItemCatalogEntry[]> {
  const firstPage = await fetchItemPage(fetchJson, 1);
  const totalPages = Math.ceil(firstPage.totalCount / firstPage.pageSize);
  const pageNumbers = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);
  const remaining = await concurrentMap(pageNumbers, concurrency, (page) => fetchItemPage(fetchJson, page));
  const items = [firstPage, ...remaining].flatMap((page) => page.items);
  if (items.length < 5_000) throw new Error(`Tibia item catalog returned only ${items.length} entries.`);
  if (new Set(items.map((item) => item.sourceId)).size !== items.length) {
    throw new Error("Tibia item catalog contains duplicate source IDs.");
  }
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

export function parseOfficialCreature(value: unknown, fallbackRace: string): TibiaCreatureCatalogEntry {
  const creature = objectValue(value);
  return {
    race: stringValue(creature.race) ?? fallbackRace,
    name: requiredCatalogString(creature.name, `creature ${fallbackRace} name`),
    imageUrl: stringValue(creature.image_url) ?? "",
    description: stringValue(creature.description) ?? "",
    behaviour: stringValue(creature.behaviour) ?? "",
    hitpoints: nonNegativeNumber(creature.hitpoints),
    experience: nonNegativeNumber(creature.experience_points),
    immune: stringArray(creature.immune),
    strong: stringArray(creature.strong),
    weakness: stringArray(creature.weakness),
    healed: stringArray(creature.healed),
    canBeParalysed: booleanValue(creature.be_paralysed),
    canBeSummoned: booleanValue(creature.be_summoned),
    summonedMana: nonNegativeNumber(creature.summoned_mana),
    canBeConvinced: booleanValue(creature.be_convinced),
    convincedMana: nonNegativeNumber(creature.convinced_mana),
    seesInvisible: booleanValue(creature.see_invisible),
    lootable: booleanValue(creature.is_lootable),
    loot: stringArray(creature.loot_list).map(decodeHtml)
  };
}

export function parseItemPage(value: unknown): { page: number; pageSize: number; totalCount: number; items: TibiaItemCatalogEntry[] } {
  const response = objectValue(value) as ItemPageResponse;
  const rawItems = Array.isArray(response.items) ? response.items : [];
  return {
    page: positiveNumber(response.page, 1),
    pageSize: positiveNumber(response.pageSize, 100),
    totalCount: nonNegativeNumber(response.totalCount),
    items: rawItems.map((raw) => {
      const item = objectValue(raw);
      const image = objectValue(item.primaryImage);
      return {
        sourceId: positiveNumber(item.id),
        name: requiredCatalogString(item.name, "item name"),
        categorySlug: stringValue(item.categorySlug),
        categoryName: stringValue(item.categoryName),
        primaryType: stringValue(item.primaryType),
        secondaryType: stringValue(item.secondaryType),
        objectClass: stringValue(item.objectClass),
        wikiUrl: stringValue(item.wikiUrl) ?? "",
        imagePath: stringValue(image.storageKey),
        sourceUpdatedAt: stringValue(item.lastUpdated) ?? ""
      };
    })
  };
}

async function fetchItemPage(fetchJson: (url: string) => Promise<unknown>, page: number) {
  return parseItemPage(await fetchJson(`${ITEM_API_URL}?page=${page}&pageSize=100`));
}

async function fetchJsonWithRetry(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "botzin-game-catalog/0.1" } });
      if (response.ok) return response.json();
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Could not fetch ${url}: HTTP ${response.status}.`);
      }
      lastError = new Error(`Could not fetch ${url}: HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await wait(attempt * 750);
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not fetch ${url}.`);
}

async function concurrentMap<T, R>(values: readonly T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredCatalogString(value: unknown, field: string): string {
  const parsed = stringValue(value);
  if (!parsed) throw new Error(`Missing ${field} in catalog response.`);
  return decodeHtml(parsed);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter((item): item is string => Boolean(item)) : [];
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function positiveNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function decodeHtml(value: string): string {
  return value.replaceAll("&#39;", "'").replaceAll("&amp;", "&").replaceAll("&quot;", '"');
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
