export interface User {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

export interface Account {
  id: string;
  name: string;
  loginIdentifier?: string;
}

export interface Character {
  id: string;
  name: string;
  accountId: string;
  world?: string;
  vocation?: string;
  level?: number;
}

export interface Machine {
  id: string;
  nodeId: string;
  name: string;
  role?: string;
}

export interface Hunt {
  id: string;
  name: string;
  city?: string;
}

export interface Skill {
  id: string;
  name: string;
  allowedVocations: string;
  category?: string;
}

export interface Assignment {
  id: string;
  machineId: string;
  characterId: string;
  huntId: string;
  status: string;
  priority?: number;
}

export interface HuntSkillRule {
  id: string;
  huntId: string;
  skillId: string;
  priority?: number;
}

export interface LearningMethod {
  id: string;
  name: string;
  methodType: string;
  scope?: string;
  huntId?: string;
  characterId?: string;
}

export interface LearningSource {
  id: string;
  name: string;
  sourceType: string;
  status?: string;
}

export interface LearningMethodSource {
  id: string;
  methodId: string;
  sourceId: string;
  role: string;
  weight?: number;
}

export interface LearningSession {
  id: string;
  name: string;
  methodId: string;
  assignmentId?: string;
  status: string;
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
}
