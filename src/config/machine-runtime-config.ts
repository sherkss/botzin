import type { BotMachine, MachineRuntimeConfig, MachineRuntimeConfigWithSecret } from "../core/bot-configuration.js";
import type { RuntimeConfig } from "./runtime-config.js";

export const DEFAULT_MACHINE_RUNTIME_CONFIG: MachineRuntimeConfig = {
  coordinatorHost: "127.0.0.1",
  coordinatorPort: 4573,
  networkBindHost: "0.0.0.0",
  networkPreferredKinds: ["ethernet", "wifi"],
  networkAdvertiseHosts: [],
  obsWebSocketUrl: "ws://127.0.0.1:4455",
  obsSourceName: "Tibia Preview",
  frameSource: "mock",
  obsProcessName: "obs64.exe",
  tibiaProcessName: "client.exe",
  tibiaSourceName: "Tibia",
  detector: "mock",
  onnxModelPath: "models/tibia-creatures.onnx",
  onnxLabelsPath: "models/tibia-creatures.labels.json",
  onnxInputWidth: 320,
  onnxInputHeight: 320,
  detectionConfidence: 0.35,
  detectionIou: 0.45,
  raspberryHost: "127.0.0.1",
  raspberryPort: 4574,
  runFrameIntervalMs: 10_000
};

export function applyMachineRuntimeConfig(
  bootstrap: RuntimeConfig,
  machine: BotMachine,
  runtime: MachineRuntimeConfigWithSecret
): RuntimeConfig {
  return {
    ...bootstrap,
    nodeId: machine.nodeId,
    role: machine.role === "coordinator" || machine.role === "raspberry-executor" ? machine.role : "perception",
    ...runtime
  };
}
