import type { InputCommand } from "../core/input-command.js";

export interface InputExecutor {
  readonly name: string;
  execute(command: InputCommand): Promise<void>;
}
