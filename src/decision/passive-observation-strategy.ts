import type { InputCommand } from "../core/input-command.js";
import type { PerceptionEvent } from "../coordination/perception-event.js";
import type { Strategy } from "./strategy.js";

export class PassiveObservationStrategy implements Strategy {
  readonly name = "passive-observation";

  async plan(_event: PerceptionEvent): Promise<readonly InputCommand[]> {
    return [];
  }
}
