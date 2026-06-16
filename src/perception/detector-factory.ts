import type { RuntimeConfig } from "../config/runtime-config.js";
import type { EntityDetector } from "./entity-detector.js";
import { LocalVisionDetector } from "./local-vision-detector.js";
import { OnnxEntityDetector } from "./onnx-entity-detector.js";

export function createEntityDetector(config: RuntimeConfig): EntityDetector {
  if (config.detector === "onnx") {
    return new OnnxEntityDetector(config);
  }

  return new LocalVisionDetector();
}
