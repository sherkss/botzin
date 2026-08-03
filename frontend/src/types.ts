export interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

export interface Account {
  id: number;
  name: string;
  loginIdentifier?: string;
}

export interface Character {
  id: number;
  name: string;
  accountId: number;
  world?: string;
  vocation?: string;
  level?: number;
}

export interface Machine {
  id: number;
  nodeId: string;
  name: string;
  role?: string;
}

export interface Hunt {
  id: number;
  name: string;
  city?: string;
}

export interface Skill {
  id: number;
  name: string;
  allowedVocations: string[];
  category?: string;
}

export interface Assignment {
  id: number;
  machineId: number;
  characterId: number;
  huntId: number;
  status: string;
  priority?: number;
}

export interface HuntSkillRule {
  id: number;
  huntId: number;
  skillId: number;
  priority?: number;
}

export interface LearningMethod {
  id: number;
  name: string;
  methodType: string;
  scope?: string;
  huntId?: number;
  characterId?: number;
}

export interface LearningSource {
  id: number;
  name: string;
  sourceType: string;
  status?: string;
}

export interface LearningMethodSource {
  methodId: number;
  sourceId: number;
  role: string;
  weight?: number;
}

export interface LearningSession {
  id: number;
  name: string;
  methodId: number;
  assignmentId?: number;
  status: string;
}

export interface LearningEvent {
  id: number;
  sessionId: number;
  eventType: string;
  reward: number | null;
}

export interface DecisionFeedback {
  id: number;
  learningEventId: number | null;
  assignmentId: number | null;
  rating: "good" | "bad" | "unsafe" | "unknown";
}

export interface AppState {
  accounts: Account[];
  characters: Character[];
  machines: Machine[];
  hunts: Hunt[];
  skills: Skill[];
  assignments: Assignment[];
  huntSkillRules: HuntSkillRule[];
  learningMethods: LearningMethod[];
  learningSources: LearningSource[];
  learningMethodSources: LearningMethodSource[];
  learningSessions: LearningSession[];
  learningEvents: LearningEvent[];
  decisionFeedback: DecisionFeedback[];
}
