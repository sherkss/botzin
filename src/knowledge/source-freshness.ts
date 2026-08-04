export type SourceFreshness = "current" | "legacy" | "unknown";

export interface SourceFreshnessInput {
  readonly gameVersion?: string | null;
  readonly currentGameVersion?: string | null;
  readonly publishedAt?: string | null;
  readonly legacyBefore?: string | null;
}

export function classifySourceFreshness(input: SourceFreshnessInput): SourceFreshness {
  const sourceVersion = versionParts(input.gameVersion);
  const currentVersion = versionParts(input.currentGameVersion);
  if (sourceVersion && currentVersion) {
    return compareVersions(sourceVersion, currentVersion) < 0 ? "legacy" : "current";
  }

  const publishedAt = dateNumber(input.publishedAt);
  const legacyBefore = dateNumber(input.legacyBefore);
  if (publishedAt !== null && legacyBefore !== null) {
    return publishedAt < legacyBefore ? "legacy" : "current";
  }
  return "unknown";
}

export function extractGameVersion(title: string): string | null {
  return title.match(/(?:\[|\b)(\d{1,2}\.\d{1,2})(?:\]|\b)/)?.[1] ?? null;
}

export function freshnessWarning(freshness: SourceFreshness, gameVersion?: string | null): string | null {
  if (freshness !== "legacy") return null;
  return `Fonte anterior ao update atual${gameVersion ? ` (cliente ${gameVersion})` : ""}. Rota e mecânica podem servir como referência, mas XP, profit, dano e dificuldade precisam de validação pós-update.`;
}

function versionParts(value: string | null | undefined): number[] | null {
  if (!value?.trim() || !/^\d+(?:\.\d+)+$/.test(value.trim())) return null;
  return value.trim().split(".").map(Number);
}

function compareVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function dateNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
