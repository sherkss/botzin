import type { ScreenFrame } from "../core/frame.js";

export interface FrameSource {
  readonly name: string;
  captureFrame(): Promise<ScreenFrame>;
}
