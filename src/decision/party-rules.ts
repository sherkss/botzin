export const PARTY_PURPOSES = ["leveling", "boss", "quest"] as const;
export const PARTY_BASE_VOCATIONS = ["knight", "druid", "sorcerer", "paladin", "monk"] as const;

export type PartyPurpose = (typeof PARTY_PURPOSES)[number];
export type PartyBaseVocation = (typeof PARTY_BASE_VOCATIONS)[number];

export interface PartyMember {
  readonly name: string;
  readonly vocation: string;
  readonly level?: number;
}

export interface SharedExperienceLevelRange {
  readonly lowestLevel: number;
  readonly highestLevel: number;
  readonly minimumAllowedLevel: number;
  readonly eligible: boolean;
}

export interface PartyValidation {
  readonly valid: boolean;
  readonly size: number;
  readonly purpose: PartyPurpose;
  readonly vocations: readonly PartyBaseVocation[];
  readonly sharedExperience: SharedExperienceLevelRange | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const VOCATION_ALIASES: Readonly<Record<string, PartyBaseVocation>> = {
  knight: "knight", "elite knight": "knight", ek: "knight",
  druid: "druid", "elder druid": "druid", ed: "druid",
  sorcerer: "sorcerer", "master sorcerer": "sorcerer", ms: "sorcerer",
  paladin: "paladin", "royal paladin": "paladin", rp: "paladin",
  monk: "monk", "exalted monk": "monk", em: "monk"
};

export function validateParty(purpose: PartyPurpose, members: readonly PartyMember[]): PartyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (members.length < 2) errors.push("A party deve ter pelo menos 2 personagens.");
  if (purpose === "leveling" && members.length > 5) {
    errors.push("Party para upar deve ter no máximo 5 personagens; boss e quest podem ultrapassar esse tamanho.");
  }

  const vocations: PartyBaseVocation[] = [];
  for (const member of members) {
    const vocation = normalizePartyVocation(member.vocation);
    if (!vocation) errors.push(`Vocação desconhecida para ${member.name || "personagem"}: ${member.vocation}.`);
    else vocations.push(vocation);
  }

  let sharedExperience: SharedExperienceLevelRange | null = null;
  if (purpose === "leveling") {
    const duplicates = [...new Set(vocations.filter((vocation, index) => vocations.indexOf(vocation) !== index))];
    if (duplicates.length) errors.push(`Party para upar não pode repetir vocação: ${duplicates.join(", ")}.`);
    const invalidLevelMembers = members.filter((member) => !Number.isSafeInteger(member.level) || (member.level ?? 0) <= 0);
    if (invalidLevelMembers.length) {
      errors.push(`Level obrigatório e inválido para: ${invalidLevelMembers.map((member) => member.name || "personagem").join(", ")}.`);
    } else {
      sharedExperience = sharedExperienceLevelRange(members.map((member) => member.level!));
      if (!sharedExperience.eligible) {
        errors.push(
          `Shared Experience indisponível: o menor level é ${sharedExperience.lowestLevel}, mas precisa ser pelo menos ${sharedExperience.minimumAllowedLevel} para acompanhar o level ${sharedExperience.highestLevel}.`
        );
      }
    }
  }

  if (!vocations.includes("knight") || !vocations.includes("druid")) {
    warnings.push("A composição normalmente recomendada tem pelo menos um EK e um ED.");
  }

  return { valid: errors.length === 0, size: members.length, purpose, vocations, sharedExperience, errors, warnings };
}

export function normalizePartyVocation(value: string): PartyBaseVocation | null {
  return VOCATION_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function sharedExperienceLevelRange(levels: readonly number[]): SharedExperienceLevelRange {
  if (levels.length < 2 || levels.some((level) => !Number.isSafeInteger(level) || level <= 0)) {
    throw new Error("Shared Experience requer pelo menos dois levels inteiros e positivos.");
  }
  const lowestLevel = Math.min(...levels);
  const highestLevel = Math.max(...levels);
  const minimumAllowedLevel = Math.ceil(highestLevel * 2 / 3);
  return { lowestLevel, highestLevel, minimumAllowedLevel, eligible: lowestLevel * 3 >= highestLevel * 2 };
}
