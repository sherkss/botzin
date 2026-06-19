/**
 * Factory helpers that create entities via the real API.
 * Each function returns the parsed response body.
 * Call them inside tests (after loginAsOperator()) to set up FK dependencies.
 */
import { post, json } from "./api.js";

export async function createAccount(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await post(
    "/api/accounts",
    { name: "Test Account", loginIdentifier: `acc-${Date.now()}@test.com`, ...overrides },
    token
  );
  return json(res);
}

export async function createCharacter(
  token: string,
  accountId: number,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await post(
    "/api/characters",
    { accountId, name: `Char-${Date.now()}`, ...overrides },
    token
  );
  return json(res);
}

export async function createMachine(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await post(
    "/api/machines",
    { nodeId: `node-${Date.now()}`, name: "Test Machine", ...overrides },
    token
  );
  return json(res);
}

export async function createHunt(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await post(
    "/api/hunts",
    { name: `Hunt-${Date.now()}`, ...overrides },
    token
  );
  return json(res);
}

export async function createSkill(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await post(
    "/api/skills",
    { name: `Skill-${Date.now()}`, allowedVocations: "knight,paladin", ...overrides },
    token
  );
  return json(res);
}

export async function createAssignment(
  token: string,
  machineId: number,
  characterId: number,
  huntId: number,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await post(
    "/api/assignments",
    { machineId, characterId, huntId, ...overrides },
    token
  );
  return json(res);
}

export async function createLearningMethod(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await post(
    "/api/learning-methods",
    { name: `Method-${Date.now()}`, ...overrides },
    token
  );
  return json(res);
}

export async function createLearningSource(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await post(
    "/api/learning-sources",
    { name: `Source-${Date.now()}`, sourceType: "manual-note", ...overrides },
    token
  );
  return json(res);
}
