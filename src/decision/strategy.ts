import type { InputCommand } from "../core/input-command.js";
import type { PerceptionEvent } from "../coordination/perception-event.js";

export interface Strategy {
  readonly name: string;
  plan(event: PerceptionEvent): Promise<readonly InputCommand[]>;
}
