export type InputCommandType =
  | "keyboard-press"
  | "keyboard-release"
  | "mouse-move"
  | "mouse-click";

export interface InputCommand {
  readonly id: string;
  readonly type: InputCommandType;
  readonly createdAt: string;
  readonly targetComputerId: string;
  readonly payload: Record<string, string | number | boolean>;
}
