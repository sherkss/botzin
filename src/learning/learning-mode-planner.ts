import type { BotLearningMethod } from "../core/bot-configuration.js";

export interface LearningPlan {
  readonly observe: readonly BotLearningMethod[];
  readonly suggest: readonly BotLearningMethod[];
  readonly execute: readonly BotLearningMethod[];
}

export class LearningModePlanner {
  plan(methods: readonly BotLearningMethod[]): LearningPlan {
    const enabledMethods = methods
      .filter((method) => method.enabled)
      .sort((left, right) => right.weight - left.weight);

    return {
      observe: enabledMethods.filter((method) => method.mode === "observe"),
      suggest: enabledMethods.filter((method) => method.mode === "suggest"),
      execute: enabledMethods.filter((method) => method.mode === "execute")
    };
  }
}
