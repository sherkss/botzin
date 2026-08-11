import { DEFAULT_MACHINE_RUNTIME_CONFIG } from "./machine-runtime-config.js";

export type NodeRole = "perception" | "coordinator" | "raspberry-executor";
export type FrameSourceKind = "mock" | "obs";
export type DetectorKind = "mock" | "onnx";

export interface RuntimeConfig {
  readonly nodeId: string;
  readonly role: NodeRole;
  readonly coordinatorHost: string;
  readonly coordinatorPort: number;
  readonly networkBindHost: string;
  readonly networkPreferredKinds: readonly string[];
  readonly networkAdvertiseHosts: readonly string[];
  readonly obsSourceName: string;
  readonly obsWebSocketUrl: string;
  readonly obsWebSocketPassword: string;
  readonly frameSource: FrameSourceKind;
  readonly obsProcessName: string;
  readonly tibiaProcessName: string;
  readonly tibiaSourceName: string;
  readonly obsCaptureWidth: number;
  readonly detector: DetectorKind;
  readonly onnxModelPath: string;
  readonly onnxLabelsPath: string;
  readonly knowledgeDir: string;
  readonly decisionLogPath: string;
  readonly runCaptureDir: string;
  readonly runFrameIntervalMs: number;
  readonly onnxInputWidth: number;
  readonly onnxInputHeight: number;
  readonly detectionConfidence: number;
  readonly detectionIou: number;
  readonly raspberryHost: string;
  readonly raspberryPort: number;
  readonly webHost: string;
  readonly webPort: number;
  readonly jwtSecret: string;
  readonly jwtExpiresInSeconds: number;
  readonly adminUsername: string;
  readonly adminPassword: string;
  readonly adminDisplayName: string;
  readonly mysqlHost: string;
  readonly mysqlPort: number;
  readonly mysqlUser: string;
  readonly mysqlPassword: string;
  readonly mysqlDatabase: string;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    nodeId: env.BOTZIN_NODE_ID ?? "pc-main",
    role: "perception",
    ...DEFAULT_MACHINE_RUNTIME_CONFIG,
    obsWebSocketPassword: "",
    knowledgeDir: env.BOTZIN_KNOWLEDGE_DIR ?? "storage/knowledge",
    decisionLogPath: env.BOTZIN_DECISION_LOG_PATH ?? "storage/live-decisions.jsonl",
    runCaptureDir: env.BOTZIN_RUN_CAPTURE_DIR ?? "storage/run-samples",
    webHost: env.BOTZIN_WEB_HOST ?? "127.0.0.1",
    webPort: parsePort(env.BOTZIN_WEB_PORT, 4580),
    jwtSecret: env.BOTZIN_JWT_SECRET ?? "change-me-use-a-long-random-secret",
    jwtExpiresInSeconds: parsePort(env.BOTZIN_JWT_EXPIRES_IN_SECONDS, 28800),
    adminUsername: env.BOTZIN_ADMIN_USERNAME ?? "admin",
    adminPassword: env.BOTZIN_ADMIN_PASSWORD ?? "change-me",
    adminDisplayName: env.BOTZIN_ADMIN_DISPLAY_NAME ?? "Administrador",
    mysqlHost: env.BOTZIN_MYSQL_HOST ?? "127.0.0.1",
    mysqlPort: parsePort(env.BOTZIN_MYSQL_PORT, 3306),
    mysqlUser: env.BOTZIN_MYSQL_USER ?? "botzin",
    mysqlPassword: env.BOTZIN_MYSQL_PASSWORD ?? "botzin",
    mysqlDatabase: env.BOTZIN_MYSQL_DATABASE ?? "botzin"
  };
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
