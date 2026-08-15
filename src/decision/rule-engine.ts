import type { InputCommand } from "../core/input-command.js";
import type { GameState } from "./game-state.js";

export type BotAction =
  | { readonly kind: "cast"; readonly skillId: number; readonly entityId?: string }
  | { readonly kind: "attack"; readonly entityId: string }
  | { readonly kind: "loot"; readonly entityId: string }
  | { readonly kind: "return"; readonly motive: "supplies" | "stamina" | "efficiency" }
  | { readonly kind: "flee" }
  | { readonly kind: "hold" };

export interface ActionProposal {
  readonly action: BotAction;
  readonly priority: number;
  readonly reason: string;
  readonly source: string;
  readonly expiresAt: number;
}

export interface DecisionRule {
  readonly id: string;
  readonly priority: number;
  evaluate(state: GameState): ActionProposal | null;
}

export interface ValidatedAction {
  readonly allowed: boolean;
  readonly reason: string;
  readonly commands: readonly InputCommand[];
}

export type ProposalValidator = (proposal: ActionProposal, state: GameState) => ValidatedAction;

export interface RuleDecision {
  readonly accepted: ActionProposal | null;
  readonly commands: readonly InputCommand[];
  readonly rejected: readonly { readonly proposal: ActionProposal; readonly reason: string }[];
  readonly reasons: readonly string[];
}

/** Priority bands from the rule plan; every rule must fit one of them. */
export const PRIORITY = {
  emergency: 950,
  survival: 800,
  combat: 600,
  positioning: 400,
  loot: 200,
  optional: 50
} as const;

/** Proposals only live for the state that produced them. */
export function propose(
  source: string,
  priority: number,
  action: BotAction,
  reason: string,
  state: GameState,
  lifetimeMs = 1_000
): ActionProposal {
  return { action, priority, reason, source, expiresAt: Date.parse(state.observedAt) + lifetimeMs };
}

export function decide(
  state: GameState,
  rules: readonly DecisionRule[],
  validate: ProposalValidator,
  now = Date.now()
): RuleDecision {
  const proposals = rules
    .map((rule) => safeEvaluate(rule, state))
    .filter((proposal): proposal is ActionProposal => proposal !== null && proposal.expiresAt > now)
    .sort((left, right) => right.priority - left.priority);

  const rejected: { proposal: ActionProposal; reason: string }[] = [];
  for (const proposal of proposals) {
    const validation = validate(proposal, state);
    if (!validation.allowed) {
      rejected.push({ proposal, reason: validation.reason });
      continue;
    }
    // Only one action leaves the engine; everything below it is recorded so the
    // panel can explain what was considered and why it lost.
    for (const loser of proposals.slice(proposals.indexOf(proposal) + 1)) {
      rejected.push({ proposal: loser, reason: `Prioridade menor que ${proposal.source}.` });
    }
    return {
      accepted: proposal,
      commands: validation.commands,
      rejected,
      reasons: [`${proposal.source}: ${proposal.reason}`, validation.reason, ...rejected.map(describeRejection)]
    };
  }
  return {
    accepted: null,
    commands: [],
    rejected,
    reasons: proposals.length === 0
      ? ["Nenhuma regra propôs ação para este estado."]
      : rejected.map(describeRejection)
  };
}

function safeEvaluate(rule: DecisionRule, state: GameState): ActionProposal | null {
  try {
    return rule.evaluate(state);
  } catch (error) {
    // A broken rule must never stop the remaining ones, least of all the
    // survival rules that run above it.
    console.warn(`[rule-engine] ${rule.id} falhou: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function describeRejection(entry: { proposal: ActionProposal; reason: string }): string {
  return `${entry.proposal.source} recusada: ${entry.reason}`;
}
