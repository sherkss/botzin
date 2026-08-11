export interface BotAccount {
  readonly id: number;
  readonly name: string;
  readonly loginIdentifier: string;
  readonly secretReference: string | null;
  readonly notes: string | null;
  readonly enabled: boolean;
}

export interface BotCharacter {
  readonly id: number;
  readonly accountId: number;
  readonly name: string;
  readonly world: string | null;
  readonly vocation: string | null;
  readonly level: number | null;
  readonly enabled: boolean;
}

export interface BotMachine {
  readonly id: number;
  readonly nodeId: string;
  readonly name: string;
  readonly role: string;
  readonly preferredHost: string | null;
  readonly connectionNotes: string | null;
  readonly runtimeConfig: MachineRuntimeConfig;
  readonly obsWebSocketPasswordConfigured: boolean;
  readonly enabled: boolean;
}

export interface MachineRuntimeConfig {
  readonly coordinatorHost: string;
  readonly coordinatorPort: number;
  readonly networkBindHost: string;
  readonly networkPreferredKinds: readonly string[];
  readonly networkAdvertiseHosts: readonly string[];
  readonly obsWebSocketUrl: string;
  readonly obsSourceName: string;
  readonly frameSource: "mock" | "obs";
  readonly obsProcessName: string;
  readonly tibiaProcessName: string;
  readonly tibiaSourceName: string;
  /** Width (px) of the OBS capture used for detection; height follows the source aspect. */
  readonly obsCaptureWidth: number;
  readonly detector: "mock" | "onnx";
  readonly onnxModelPath: string;
  readonly onnxLabelsPath: string;
  readonly onnxInputWidth: number;
  readonly onnxInputHeight: number;
  readonly detectionConfidence: number;
  readonly detectionIou: number;
  readonly raspberryHost: string;
  readonly raspberryPort: number;
  readonly runFrameIntervalMs: number;
}

export interface MachineRuntimeConfigWithSecret extends MachineRuntimeConfig {
  readonly obsWebSocketPassword: string;
}

export interface BotHunt {
  readonly id: number;
  readonly name: string;
  readonly city: string | null;
  readonly routeProfile: string | null;
  readonly minLevel: number | null;
  readonly notes: string | null;
  readonly enabled: boolean;
}

export interface BotSkill {
  readonly id: number;
  readonly name: string;
  readonly spellWords: string | null;
  readonly hotkey: string | null;
  readonly category: "attack" | "healing" | "support" | "utility";
  readonly manaCost: number | null;
  readonly requiredLevel: number;
  readonly allowedVocations: readonly string[];
  readonly cooldownMs: number;
  readonly notes: string | null;
  readonly enabled: boolean;
}

export interface BotClientSpellBinding {
  readonly id: number;
  readonly characterId: number;
  readonly skillId: number;
  readonly hotkey: string;
  readonly multiActionSlot: 1 | 2 | 3;
  readonly castMode: "hotkey" | "spell-words";
  readonly targetMode: "self" | "current-target" | "crosshair";
  readonly requireGameFocus: boolean;
  readonly lastVerifiedAt: string | null;
  readonly notes: string | null;
  readonly enabled: boolean;
}

export interface BotHuntAssignment {
  readonly id: number;
  readonly machineId: number;
  readonly characterId: number;
  readonly huntId: number;
  readonly status: "planned" | "active" | "paused" | "disabled";
  readonly priority: number;
  readonly minStaminaMinutes: number;
  readonly refillConfigJson: string | null;
  readonly notes: string | null;
}

export interface BotHuntSkillRule {
  readonly id: number;
  readonly huntId: number;
  readonly skillId: number;
  readonly priority: number;
  readonly minManaPercent: number | null;
  readonly maxManaPercent: number | null;
  readonly minHpPercent: number | null;
  readonly maxHpPercent: number | null;
  readonly minCreatures: number | null;
  readonly maxCreatures: number | null;
  readonly enabled: boolean;
  readonly notes: string | null;
}

export interface BotHuntTelemetry {
  readonly id: number;
  readonly characterId: number;
  readonly huntId: number;
  readonly assignmentId: number | null;
  readonly runId: number | null;
  readonly capturedAt: string;
  readonly durationSeconds: number | null;
  readonly xpRatePercent: number;
  readonly xpGain: number | null;
  readonly rawXpGain: number | null;
  readonly xpPerHour: number | null;
  readonly rawXpPerHour: number | null;
  readonly lootValue: number | null;
  readonly suppliesValue: number | null;
  readonly profit: number | null;
  readonly creaturesJson: string | null;
  readonly rawText: string | null;
  readonly source: "session-analyser" | "ocr" | "manual" | "telemetry";
}

export interface BotCharacterRun {
  readonly id: number;
  readonly assignmentId: number;
  readonly machineId: number;
  readonly characterId: number;
  readonly huntId: number;
  readonly status: "running" | "completed" | "aborted";
  readonly clientVersion: string | null;
  readonly loadoutJson: string | null;
  readonly routeSnapshotJson: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly notes: string | null;
}

export interface BotCharacterRunSample {
  readonly id: number;
  readonly runId: number;
  readonly observedAt: string;
  readonly sampleType: "perception" | "decision" | "action" | "outcome" | "danger" | "telemetry" | "route" | "screen";
  readonly decisionId: string | null;
  readonly framePath: string | null;
  readonly dangerLevel: "none" | "low" | "medium" | "high" | "critical";
  readonly stateJson: string | null;
  readonly actionJson: string | null;
  readonly outcomeJson: string | null;
  readonly notes: string | null;
}

export interface BotLearningMethod {
  readonly id: number;
  readonly name: string;
  readonly methodType:
    | "manual-rules"
    | "human-demonstration"
    | "replay"
    | "human-feedback"
    | "hunt-telemetry"
    | "external-knowledge";
  readonly scope: "global" | "hunt" | "character" | "party";
  readonly huntId: number | null;
  readonly characterId: number | null;
  readonly weight: number;
  readonly mode: "observe" | "suggest" | "execute";
  readonly configJson: string | null;
  readonly notes: string | null;
  readonly enabled: boolean;
}

export interface BotLearningSession {
  readonly id: number;
  readonly methodId: number;
  readonly assignmentId: number | null;
  readonly name: string;
  readonly status: "recording" | "reviewing" | "approved" | "rejected" | "archived";
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly summaryJson: string | null;
  readonly notes: string | null;
}

export interface BotLearningSource {
  readonly id: number;
  readonly name: string;
  readonly sourceType:
    | "video"
    | "image"
    | "text"
    | "web-page"
    | "market-snapshot"
    | "obs-recording"
    | "replay"
    | "telemetry"
    | "manual-note";
  readonly uri: string | null;
  readonly contentHash: string | null;
  readonly language: string | null;
  readonly status: "pending" | "processing" | "ready" | "failed" | "archived";
  readonly trustLevel: "low" | "medium" | "high" | "verified";
  readonly capturedAt: string | null;
  readonly processedAt: string | null;
  readonly metadataJson: string | null;
  readonly notes: string | null;
  readonly enabled: boolean;
}

export interface BotLearningMethodSource {
  readonly methodId: number;
  readonly sourceId: number;
  readonly role: "primary" | "validation" | "reference" | "negative-example";
  readonly weight: number;
}

export interface BotLearningEvent {
  readonly id: number;
  readonly sessionId: number;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly stateJson: string | null;
  readonly actionJson: string | null;
  readonly reward: number | null;
  readonly notes: string | null;
}

export interface BotDecisionFeedback {
  readonly id: number;
  readonly learningEventId: number | null;
  readonly assignmentId: number | null;
  readonly rating: "good" | "bad" | "unsafe" | "unknown";
  readonly correctionActionJson: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
}

export interface BotConfigurationSnapshot {
  readonly accounts: readonly BotAccount[];
  readonly characters: readonly BotCharacter[];
  readonly machines: readonly BotMachine[];
  readonly hunts: readonly BotHunt[];
  readonly skills: readonly BotSkill[];
  readonly clientSpellBindings: readonly BotClientSpellBinding[];
  readonly assignments: readonly BotHuntAssignment[];
  readonly huntSkillRules: readonly BotHuntSkillRule[];
  readonly huntTelemetry: readonly BotHuntTelemetry[];
  readonly characterRuns: readonly BotCharacterRun[];
  readonly learningMethods: readonly BotLearningMethod[];
  readonly learningSources: readonly BotLearningSource[];
  readonly learningMethodSources: readonly BotLearningMethodSource[];
  readonly learningSessions: readonly BotLearningSession[];
  readonly learningEvents: readonly BotLearningEvent[];
  readonly decisionFeedback: readonly BotDecisionFeedback[];
}
