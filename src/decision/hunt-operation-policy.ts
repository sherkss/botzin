export interface VitalObservation {
  readonly current: number;
  readonly max: number;
}

export interface CharacterOperationObservation {
  readonly staminaMinutes: number | null;
  readonly capacity: number | null;
  readonly supplies: Readonly<Record<string, number>>;
  /** Absent while the screen reader still cannot see the health bar. */
  readonly health?: VitalObservation | null;
  readonly mana?: VitalObservation | null;
}

export interface RefillSupplyRule {
  readonly returnAt: number;
  readonly buyTo: number | null;
}

export interface HuntOperationPolicy {
  readonly minStaminaMinutes: number;
  readonly capacityBelow: number | null;
  readonly supplies: Readonly<Record<string, RefillSupplyRule>>;
  readonly depositLoot: boolean;
}

export interface HuntOperationDecision {
  readonly action: "continue" | "refill" | "stop-stamina" | "await-reading";
  readonly reasons: readonly string[];
  readonly refillItems: readonly string[];
}

export function policyFromRunSnapshot(value: string | null): HuntOperationPolicy {
  const fallback: HuntOperationPolicy = { minStaminaMinutes: 2340, capacityBelow: null, supplies: {}, depositLoot: true };
  if (!value) return fallback;
  try {
    const snapshot = JSON.parse(value) as Record<string, unknown>;
    const refill = objectValue(snapshot.refill);
    const rawSupplies = objectValue(refill.supplies);
    const supplies: Record<string, RefillSupplyRule> = {};
    for (const [name, rawRule] of Object.entries(rawSupplies)) {
      const rule = objectValue(rawRule);
      const returnAt = nonNegativeNumber(rule.returnAt);
      if (returnAt === null) continue;
      supplies[name.toLowerCase()] = { returnAt, buyTo: nonNegativeNumber(rule.buyTo) };
    }
    return {
      minStaminaMinutes: nonNegativeNumber(snapshot.minStaminaMinutes) ?? fallback.minStaminaMinutes,
      capacityBelow: nonNegativeNumber(refill.capacityBelow),
      supplies,
      depositLoot: typeof refill.depositLoot === "boolean" ? refill.depositLoot : true
    };
  } catch {
    return fallback;
  }
}

export function evaluateHuntOperation(
  policy: HuntOperationPolicy,
  observation: CharacterOperationObservation | null | undefined
): HuntOperationDecision {
  if (!observation) {
    return { action: "await-reading", reasons: ["Stamina, capacidade e supplies ainda não foram lidos da tela."], refillItems: [] };
  }
  if (observation.staminaMinutes !== null && observation.staminaMinutes < policy.minStaminaMinutes) {
    return {
      action: "stop-stamina",
      reasons: [`Stamina ${observation.staminaMinutes} min abaixo do limite ${policy.minStaminaMinutes} min.`],
      refillItems: []
    };
  }
  const refillItems = Object.entries(policy.supplies)
    .filter(([name, rule]) => (observation.supplies[name] ?? 0) <= rule.returnAt)
    .map(([name]) => name);
  const lowCapacity = policy.capacityBelow !== null && observation.capacity !== null && observation.capacity <= policy.capacityBelow;
  if (lowCapacity || refillItems.length > 0) {
    return {
      action: "refill",
      reasons: [
        ...(lowCapacity ? [`Capacidade ${observation.capacity} abaixo do limite ${policy.capacityBelow}.`] : []),
        ...(refillItems.length > 0 ? [`Supplies abaixo do mínimo: ${refillItems.join(", ")}.`] : [])
      ],
      refillItems
    };
  }
  return { action: "continue", reasons: ["Stamina, capacidade e supplies dentro dos limites."], refillItems: [] };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nonNegativeNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
