import { ValidationError } from "../core/errors.js";

export interface ParsedHuntTelemetry {
  readonly durationSeconds: number | null;
  readonly xpGain: number | null;
  readonly rawXpGain: number | null;
  readonly xpPerHour: number | null;
  readonly rawXpPerHour: number | null;
  readonly lootValue: number | null;
  readonly suppliesValue: number | null;
  readonly profit: number | null;
  readonly creatures: Readonly<Record<string, number>>;
}

export function parseSessionAnalyser(rawText: string): ParsedHuntTelemetry {
  const text = rawText.replace(/\r/g, "").trim();
  if (!text) throw new ValidationError("Session Analyser text is required.");

  const lootValue = fieldNumber(text, ["Loot"]);
  const suppliesValue = fieldNumber(text, ["Supplies"]);
  const balance = fieldNumber(text, ["Balance", "Profit"]);
  const parsed: ParsedHuntTelemetry = {
    durationSeconds: parseDuration(fieldText(text, ["Session", "Duration", "Duração"])),
    xpGain: fieldNumber(text, ["XP Gain", "Experience Gain"]),
    rawXpGain: fieldNumber(text, ["Raw XP Gain", "Raw Experience Gain"]),
    xpPerHour: fieldNumber(text, ["XP/h", "XP per hour"]),
    rawXpPerHour: fieldNumber(text, ["Raw XP/h", "Raw XP per hour"]),
    lootValue,
    suppliesValue,
    profit: balance ?? (lootValue !== null && suppliesValue !== null ? lootValue - suppliesValue : null),
    creatures: parseCreatures(text)
  };

  const numericValues = [parsed.xpGain, parsed.rawXpGain, parsed.xpPerHour, parsed.rawXpPerHour, lootValue, suppliesValue, parsed.profit];
  if (numericValues.every((value) => value === null) && Object.keys(parsed.creatures).length === 0) {
    throw new ValidationError("The text does not contain recognizable Hunting Session Analyser fields.");
  }
  return parsed;
}

function fieldText(text: string, labels: readonly string[]): string | null {
  for (const label of labels) {
    const match = text.match(new RegExp(`^\\s*${escapeRegExp(label)}\\s*:\\s*(.+?)\\s*$`, "im"));
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function fieldNumber(text: string, labels: readonly string[]): number | null {
  const value = fieldText(text, labels);
  return value === null ? null : parseGameNumber(value);
}

export function parseGameNumber(value: string): number | null {
  const compact = value.trim().replace(/\s/g, "");
  const suffix = compact.match(/([kKmM])$/)?.[1]?.toLowerCase();
  const withoutSuffix = suffix ? compact.slice(0, -1) : compact;
  const sign = withoutSuffix.startsWith("-") ? -1 : 1;
  if (suffix) {
    const decimal = Number(withoutSuffix.replace(",", "."));
    if (!Number.isFinite(decimal)) return null;
    return Math.round(decimal * (suffix === "k" ? 1_000 : 1_000_000));
  }
  const digits = withoutSuffix.replace(/^[+-]/, "").replace(/[.,]/g, "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const base = Number(digits) * sign;
  if (!Number.isSafeInteger(base)) return null;
  return base;
}

function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const clock = value.match(/(\d{1,3}):(\d{2})(?::(\d{2}))?\s*h?/i);
  if (clock) {
    return clock[3]
      ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      : Number(clock[1]) * 3600 + Number(clock[2]) * 60;
  }
  const words = value.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/i);
  if (!words || (!words[1] && !words[2] && !words[3])) return null;
  return Number(words[1] ?? 0) * 3600 + Number(words[2] ?? 0) * 60 + Number(words[3] ?? 0);
}

function parseCreatures(text: string): Readonly<Record<string, number>> {
  const marker = text.search(/^\s*(Killed Monsters|Monstros Mortos)\s*:/im);
  if (marker < 0) return {};
  const section = text.slice(marker).split(/\n/).slice(1);
  const creatures: Record<string, number> = {};
  for (const line of section) {
    if (/^\s*[A-Za-z /]+\s*:/.test(line)) break;
    const match = line.trim().match(/^(\d[\d.,]*)\s*x?\s+(.+?)\s*$/i);
    if (!match) continue;
    const count = parseGameNumber(match[1]!);
    if (count !== null && count >= 0) creatures[match[2]!.trim()] = count;
  }
  return creatures;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
