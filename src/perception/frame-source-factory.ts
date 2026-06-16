import type { RuntimeConfig } from "../config/runtime-config.js";
import type { FrameSource } from "./frame-source.js";
import { MockFrameSource } from "./mock-frame-source.js";
import { ObsPreviewFrameSource } from "./obs-preview-frame-source.js";

export function createFrameSource(config: RuntimeConfig): FrameSource {
  if (config.frameSource === "obs") {
    return new ObsPreviewFrameSource(config);
  }

  return new MockFrameSource(config);
}
