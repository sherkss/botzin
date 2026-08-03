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
  readonly enabled: boolean;
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
  readonly manaCost: number;
  readonly requiredLevel: number;
  readonly allowedVocations: readonly string[];
  readonly cooldownMs: number;
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
  readonly assignments: readonly BotHuntAssignment[];
  readonly huntSkillRules: readonly BotHuntSkillRule[];
  readonly huntTelemetry: readonly BotHuntTelemetry[];
  readonly learningMethods: readonly BotLearningMethod[];
  readonly learningSources: readonly BotLearningSource[];
  readonly learningMethodSources: readonly BotLearningMethodSource[];
  readonly learningSessions: readonly BotLearningSession[];
  readonly learningEvents: readonly BotLearningEvent[];
  readonly decisionFeedback: readonly BotDecisionFeedback[];
}
