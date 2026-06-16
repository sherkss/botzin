import { randomUUID } from "node:crypto";
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { ScreenFrame } from "../core/frame.js";
import type { FrameSource } from "./frame-source.js";

export class MockFrameSource implements FrameSource {
  readonly name = "mock";

  constructor(private readonly config: RuntimeConfig) {}

  async captureFrame(): Promise<ScreenFrame> {
    return {
      id: randomUUID(),
      sourceComputerId: this.config.nodeId,
      source: "mock",
      capturedAt: new Date().toISOString(),
      width: 1920,
      height: 1080,
      data: new Uint8Array(),
      mimeType: "application/octet-stream"
    };
  }
}
