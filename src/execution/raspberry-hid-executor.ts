import type { RuntimeConfig } from "../config/runtime-config.js";
import type { InputCommand } from "../core/input-command.js";
import type { InputExecutor } from "./input-executor.js";

export class RaspberryHidExecutor implements InputExecutor {
  readonly name = "raspberry-hid";

  constructor(private readonly config: RuntimeConfig) {}

  async execute(command: InputCommand): Promise<void> {
    throw new Error(
      `Raspberry HID transport is not implemented yet. Command ${command.id} would be sent to ${this.config.raspberryHost}:${this.config.raspberryPort}.`
    );
  }
}
