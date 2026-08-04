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
    role: parseRole(env.BOTZIN_ROLE),
    coordinatorHost: env.BOTZIN_COORDINATOR_HOST ?? "127.0.0.1",
    coordinatorPort: parsePort(env.BOTZIN_COORDINATOR_PORT, 4573),
    networkBindHost: env.BOTZIN_NETWORK_BIND_HOST ?? "0.0.0.0",
    networkPreferredKinds: parseCsv(env.BOTZIN_NETWORK_PREFERRED, ["ethernet", "wifi"]),
    networkAdvertiseHosts: parseCsv(env.BOTZIN_NETWORK_ADVERTISE_HOSTS, []),
    obsSourceName: env.BOTZIN_OBS_SOURCE_NAME ?? "Tibia Preview",
    obsWebSocketUrl: env.BOTZIN_OBS_WEBSOCKET_URL ?? "ws://127.0.0.1:4455",
    obsWebSocketPassword: env.BOTZIN_OBS_WEBSOCKET_PASSWORD ?? "",
    frameSource: parseFrameSource(env.BOTZIN_FRAME_SOURCE),
    obsProcessName: env.BOTZIN_OBS_PROCESS_NAME ?? "obs64.exe",
    tibiaProcessName: env.BOTZIN_TIBIA_PROCESS_NAME ?? "client.exe",
    tibiaSourceName: env.BOTZIN_TIBIA_SOURCE_NAME ?? "Tibia",
    detector: parseDetector(env.BOTZIN_DETECTOR),
    onnxModelPath: env.BOTZIN_ONNX_MODEL_PATH ?? "models/tibia-entities.onnx",
    onnxLabelsPath: env.BOTZIN_ONNX_LABELS_PATH ?? "models/tibia-entities.example.json",
    knowledgeDir: env.BOTZIN_KNOWLEDGE_DIR ?? "storage/knowledge",
    decisionLogPath: env.BOTZIN_DECISION_LOG_PATH ?? "storage/live-decisions.jsonl",
    runCaptureDir: env.BOTZIN_RUN_CAPTURE_DIR ?? "storage/run-samples",
    runFrameIntervalMs: parsePort(env.BOTZIN_RUN_FRAME_INTERVAL_MS, 10_000),
    onnxInputWidth: parsePort(env.BOTZIN_ONNX_INPUT_WIDTH, 640),
    onnxInputHeight: parsePort(env.BOTZIN_ONNX_INPUT_HEIGHT, 640),
    detectionConfidence: parseNumber(env.BOTZIN_DETECTION_CONFIDENCE, 0.35),
    detectionIou: parseNumber(env.BOTZIN_DETECTION_IOU, 0.45),
    raspberryHost: env.BOTZIN_RASPBERRY_HOST ?? "127.0.0.1",
    raspberryPort: parsePort(env.BOTZIN_RASPBERRY_PORT, 4574),
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

function parseFrameSource(value: string | undefined): FrameSourceKind {
  return value === "obs" ? "obs" : "mock";
}

function parseDetector(value: string | undefined): DetectorKind {
  return value === "onnx" ? "onnx" : "mock";
}

function parseCsv(value: string | undefined, fallback: readonly string[]): readonly string[] {
  if (!value) {
    return fallback;
  }

  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length > 0 ? values : fallback;
}

function parseRole(value: string | undefined): NodeRole {
  if (value === "coordinator" || value === "raspberry-executor") {
    return value;
  }

  return "perception";
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
