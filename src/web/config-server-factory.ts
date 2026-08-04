import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, extname, join, normalize } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Busboy from "busboy";
import bcrypt from "bcryptjs";
import type { Pool } from "mysql2/promise";
import type { AuthenticatedConfigUser, ConfigUserRole } from "../core/config-user.js";
import { ValidationError } from "../core/errors.js";
import { JwtService } from "../auth/jwt-service.js";
import { hasRole } from "../auth/role-policy.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { ConfigUserRepository } from "../database/config-user-repository.js";
import { ConfigurationRepository } from "../database/configuration-repository.js";
import { GameCatalogRepository } from "../database/game-catalog-repository.js";
import { TIBIA_KNOWLEDGE_DOMAINS } from "../learning/tibia-general-knowledge.js";
import { TibiaLiveStatusService } from "../knowledge/tibia-live-status.js";
import { ObsPreviewFrameSource } from "../perception/obs-preview-frame-source.js";
import { KnowledgeStore } from "../knowledge/knowledge-store.js";
import { LiveDecisionStore } from "../decision/live-decision-store.js";
import { parseSessionAnalyser } from "../telemetry/session-analyser-parser.js";

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 8;

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function httpError(statusCode: number, message: string): HttpError {
  return new HttpError(statusCode, message);
}

function statusCodeFor(error: unknown): number {
  if (error instanceof HttpError) return error.statusCode;
  if (error instanceof ValidationError) return 400;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code);
    if (code === "ER_DUP_ENTRY") return 409;
    if (["ER_NO_REFERENCED_ROW_2", "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD", "ER_DATA_TOO_LONG"].includes(code)) {
      return 400;
    }
  }
  return 500;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  const declaredBytes = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_JSON_BYTES) {
    throw httpError(413, "JSON body exceeds the 1 MB limit.");
  }

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > MAX_JSON_BYTES) {
      request.resume();
      throw httpError(413, "JSON body exceeds the 1 MB limit.");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw httpError(400, "JSON body must be an object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw httpError(400, "JSON body is invalid.");
  }
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function isAllowedVideo(filename: string, mimeType: string): boolean {
  const extension = extname(filename).toLowerCase();
  return ["video/mp4", "video/x-matroska", "video/quicktime", "video/x-msvideo", "video/webm"].includes(mimeType) &&
    [".mp4", ".mkv", ".mov", ".avi", ".webm"].includes(extension);
}

function hasAllowedVideoSignature(filename: string, header: Buffer): boolean {
  const extension = extname(filename).toLowerCase();
  if (extension === ".mp4" || extension === ".mov") {
    return header.length >= 8 && header.subarray(4, 8).toString("ascii") === "ftyp";
  }
  if (extension === ".avi") {
    return header.length >= 12 && header.subarray(0, 4).toString("ascii") === "RIFF" &&
      header.subarray(8, 11).toString("ascii") === "AVI";
  }
  if (extension === ".mkv" || extension === ".webm") {
    return header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  return false;
}

function sanitizeFilename(filename: string): string {
  const safeBase = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeBase || "hunt-video.mp4";
}

export function createConfigServer(
  config: RuntimeConfig,
  pool: Pool,
  publicDir: string,
  storageDir: string,
  knowledgeDir = join(storageDir, "knowledge"),
  decisionLogPath = join(storageDir, "live-decisions.jsonl")
): Server {
  const repository = new ConfigurationRepository(pool);
  const gameCatalogRepository = new GameCatalogRepository(pool);
  const tibiaLiveStatus = new TibiaLiveStatusService();
  const userRepository = new ConfigUserRepository(pool);
  const jwtService = new JwtService(config);
  const obsPreview = new ObsPreviewFrameSource(config);
  const knowledgeStore = new KnowledgeStore(knowledgeDir);
  const liveDecisionStore = new LiveDecisionStore(decisionLogPath);
  const loginFailures = new Map<string, { count: number; resetAt: number }>();
  const dummyPasswordHash = bcrypt.hash(randomUUID(), 12);

  async function handleApi(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? "GET";
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = requestUrl.pathname;

    if (method === "POST" && pathname === "/api/auth/login") {
      sendJson(response, 200, await login(request, await readJson(request)));
      return;
    }

    const user = await authenticate(request);

    if (method === "GET" && pathname === "/api/auth/me") {
      sendJson(response, 200, { user });
      return;
    }

    if (method === "GET" && pathname === "/api/config") {
      requireRole(user, "viewer");
      sendJson(response, 200, await repository.getSnapshot());
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/creatures") {
      requireRole(user, "viewer");
      const options = catalogSearchOptions(requestUrl);
      sendJson(response, 200, await gameCatalogRepository.searchCreatures(options.query, options.limit, options.offset));
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/items") {
      requireRole(user, "viewer");
      const options = catalogSearchOptions(requestUrl);
      sendJson(response, 200, await gameCatalogRepository.searchItems(options.query, options.limit, options.offset));
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/knowledge") {
      requireRole(user, "viewer");
      const options = catalogSearchOptions(requestUrl);
      const domain = (requestUrl.searchParams.get("domain") ?? "").trim() || null;
      if (domain && !TIBIA_KNOWLEDGE_DOMAINS.includes(domain as (typeof TIBIA_KNOWLEDGE_DOMAINS)[number])) {
        throw httpError(400, "Unknown Tibia knowledge domain.");
      }
      sendJson(response, 200, await gameCatalogRepository.searchKnowledge(options.query, domain, options.limit, options.offset));
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/knowledge/coverage") {
      requireRole(user, "viewer");
      sendJson(response, 200, await gameCatalogRepository.knowledgeCoverage());
      return;
    }

    if (method === "GET" && pathname === "/api/catalog/live-status") {
      requireRole(user, "viewer");
      sendJson(response, 200, await tibiaLiveStatus.get());
      return;
    }

    if (method === "GET" && pathname === "/api/knowledge/coverage") {
      requireRole(user, "viewer");
      sendJson(response, 200, await knowledgeStore.coverage());
      return;
    }

    if (method === "GET" && pathname === "/api/knowledge/search") {
      requireRole(user, "viewer");
      const query = (requestUrl.searchParams.get("q") ?? "").trim();
      if (!query) throw httpError(400, "Knowledge search query is required.");
      if (query.length > 200) throw httpError(400, "Knowledge search query is limited to 200 characters.");
      const limit = Number(requestUrl.searchParams.get("limit") ?? 5);
      sendJson(response, 200, { query, results: await knowledgeStore.search(query, limit) });
      return;
    }

    if (method === "GET" && pathname === "/api/decisions/live") {
      requireRole(user, "viewer");
      const limit = Number(requestUrl.searchParams.get("limit") ?? 50);
      const activeWindowMs = Math.max(config.decisionIntervalMs * 3, 5_000);
      sendJson(response, 200, await liveDecisionStore.snapshot(limit, activeWindowMs));
      return;
    }

    if (method === "GET" && pathname === "/api/hunt-telemetry") {
      requireRole(user, "viewer");
      const characterValue = requestUrl.searchParams.get("characterId");
      const characterId = characterValue === null ? undefined : Number(characterValue);
      if (characterId !== undefined && (!Number.isSafeInteger(characterId) || characterId <= 0)) {
        throw httpError(400, "characterId must be a positive integer.");
      }
      sendJson(response, 200, { samples: await repository.listHuntTelemetry(characterId) });
      return;
    }

    if (method === "POST" && pathname === "/api/hunt-telemetry") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createHuntTelemetry(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/hunt-telemetry/import-analyser") {
      requireRole(user, "operator");
      const payload = await readJson(request);
      if (typeof payload.rawText !== "string") throw httpError(400, "rawText is required.");
      const parsed = parseSessionAnalyser(payload.rawText);
      sendJson(response, 201, await repository.createHuntTelemetry({
        ...payload,
        ...parsed,
        creaturesJson: parsed.creatures,
        source: "session-analyser"
      }));
      return;
    }

    if (method === "GET" && pathname === "/api/obs/preview") {
      requireRole(user, "viewer");
      try {
        const frame = await obsPreview.captureFrame();
        response.writeHead(200, {
          "Content-Type": frame.mimeType,
          "Cache-Control": "no-store, no-cache",
          "X-Frame-Width": String(frame.width),
          "X-Frame-Height": String(frame.height),
        });
        response.end(frame.data);
      } catch {
        sendJson(response, 503, { error: "OBS not available." });
      }
      return;
    }

    if (method === "POST" && pathname === "/api/accounts") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createAccount(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/characters") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createCharacter(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/machines") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createMachine(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/hunts") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createHunt(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/skills") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createSkill(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/client-spell-bindings") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createClientSpellBinding(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/assignments") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createAssignment(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/hunt-skill-rules") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createHuntSkillRule(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/learning-methods") {
      requireRole(user, "operator");
      const payload = await readJson(request);
      if (payload.mode === "execute") requireRole(user, "admin");
      sendJson(response, 201, await repository.createLearningMethod(payload));
      return;
    }

    if (method === "POST" && pathname === "/api/learning-sources") {
      requireRole(user, "operator");
      const payload = await readJson(request);
      if (payload.trustLevel === "high" || payload.trustLevel === "verified") requireRole(user, "admin");
      sendJson(response, 201, await repository.createLearningSource(payload));
      return;
    }

    if (method === "POST" && pathname === "/api/learning-sources/upload-video") {
      requireRole(user, "operator");
      sendJson(response, 201, await uploadLearningVideo(request));
      return;
    }

    if (method === "POST" && pathname === "/api/learning-method-sources") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createLearningMethodSource(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/learning-sessions") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createLearningSession(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/learning-events") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createLearningEvent(await readJson(request)));
      return;
    }

    if (method === "POST" && pathname === "/api/decision-feedback") {
      requireRole(user, "operator");
      sendJson(response, 201, await repository.createDecisionFeedback(await readJson(request)));
      return;
    }

    sendJson(response, 404, { error: "API route not found." });
  }

  async function login(request: IncomingMessage, payload: Record<string, unknown>): Promise<unknown> {
    const clientKey = request.socket.remoteAddress ?? "unknown";
    enforceLoginRateLimit(clientKey);
    const username = typeof payload.username === "string" ? payload.username.trim() : "";
    const password = typeof payload.password === "string" ? payload.password : "";

    if (!username || !password) {
      throw httpError(400, "Username and password are required.");
    }

    const user = await userRepository.findByUsername(username);
    if (!user || !user.enabled) {
      await bcrypt.compare(password, await dummyPasswordHash);
      recordLoginFailure(clientKey);
      throw httpError(401, "Invalid username or password.");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordLoginFailure(clientKey);
      throw httpError(401, "Invalid username or password.");
    }

    loginFailures.delete(clientKey);
    await userRepository.markLogin(user.id);

    const safeUser: AuthenticatedConfigUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    };

    return { token: jwtService.sign(safeUser), user: safeUser };
  }

  async function authenticate(request: IncomingMessage): Promise<AuthenticatedConfigUser> {
    const authorization = request.headers.authorization ?? "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw httpError(401, "Missing Bearer token.");
    }

    try {
      const tokenUser = jwtService.verify(token);
      const currentUser = await userRepository.findById(tokenUser.id);
      if (!currentUser || !currentUser.enabled || currentUser.username !== tokenUser.username || currentUser.role !== tokenUser.role) {
        throw new Error("Token user is no longer authorized.");
      }
      return tokenUser;
    } catch {
      throw httpError(401, "Invalid or expired token.");
    }
  }

  function enforceLoginRateLimit(clientKey: string): void {
    const now = Date.now();
    const entry = loginFailures.get(clientKey);
    if (!entry || entry.resetAt <= now) {
      loginFailures.delete(clientKey);
      return;
    }
    if (entry.count >= MAX_LOGIN_FAILURES) {
      throw httpError(429, "Too many login attempts. Try again later.");
    }
  }

  function recordLoginFailure(clientKey: string): void {
    const now = Date.now();
    const current = loginFailures.get(clientKey);
    if (!current || current.resetAt <= now) {
      loginFailures.set(clientKey, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      return;
    }
    current.count += 1;
  }

  function requireRole(user: AuthenticatedConfigUser, role: ConfigUserRole): void {
    if (!hasRole(user.role, role)) {
      throw httpError(403, `Role "${role}" is required.`);
    }
  }

  async function uploadLearningVideo(request: IncomingMessage): Promise<unknown> {
    await mkdir(storageDir, { recursive: true });

    return new Promise((resolvePromise, reject) => {
      const busboy = Busboy({ headers: request.headers, limits: { files: 1, fileSize: MAX_VIDEO_BYTES } });
      const fields: Record<string, string> = {};
      let storedPath: string | null = null;
      let originalFilename: string | null = null;
      let mimeType: string | null = null;
      let fileWrite: Promise<void> | null = null;
      let fileWriter: ReturnType<typeof createWriteStream> | null = null;
      let fileHash: ReturnType<typeof createHash> | null = null;
      let fileHeader = Buffer.alloc(0);
      let settled = false;

      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        request.unpipe(busboy);
        const partialPath = storedPath;
        if (fileWriter && !fileWriter.closed) {
          fileWriter.once("close", () => { void cleanupPartialFile(partialPath); });
          fileWriter.destroy();
          void fileWrite?.catch(() => undefined);
        } else {
          void cleanupPartialFile(partialPath);
        }
        reject(error);
      };

      busboy.on("field", (name, value) => { fields[name] = value; });

      busboy.on("file", (_name, file, info) => {
        originalFilename = info.filename;
        mimeType = info.mimeType;

        if (!isAllowedVideo(info.filename, info.mimeType)) {
          file.resume();
          fail(new ValidationError("Video format is not allowed. Use mp4, mkv, mov, avi or webm."));
          return;
        }

        const safeName = sanitizeFilename(info.filename);
        storedPath = join(storageDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-${safeName}`);
        const writer = createWriteStream(storedPath);
        fileWriter = writer;
        fileHash = createHash("sha256");
        file.on("data", (chunk: Buffer) => {
          fileHash?.update(chunk);
          if (fileHeader.length < 12) fileHeader = Buffer.concat([fileHeader, chunk.subarray(0, 12 - fileHeader.length)]);
        });
        file.pipe(writer);
        fileWrite = new Promise((resolveWrite, rejectWrite) => {
          writer.on("finish", resolveWrite);
          writer.on("error", rejectWrite);
          file.on("error", rejectWrite);
          file.on("limit", () => { rejectWrite(new ValidationError("Video exceeds the 10 GB upload limit.")); });
        });
      });

      busboy.on("error", fail);

      busboy.on("finish", async () => {
        try {
          if (!storedPath || !fileWrite) throw new ValidationError("No video file was uploaded.");
          await fileWrite;

          if (!originalFilename || !hasAllowedVideoSignature(originalFilename, fileHeader)) {
            throw new ValidationError("Uploaded file content does not match the declared video format.");
          }
          if (!fileHash) throw new ValidationError("Unable to hash the uploaded video.");
          const source = await repository.createLearningSource({
            name: fields.name || originalFilename || basename(storedPath),
            sourceType: fields.sourceType || "video",
            uri: storedPath,
            contentHash: fileHash.digest("hex"),
            language: fields.language || null,
            status: "pending",
            trustLevel: "low",
            capturedAt: fields.capturedAt || null,
            metadataJson: JSON.stringify({ originalFilename, mimeType, hunt: fields.hunt || null, quest: fields.quest || null }),
            notes: fields.notes || null,
            enabled: true
          });

          if (settled) return;
          settled = true;
          resolvePromise(source);
        } catch (error) {
          fail(error);
        }
      });

      request.pipe(busboy);
      request.on("aborted", () => fail(new ValidationError("Upload was interrupted.")));
    });
  }

  async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const filePath = normalize(join(publicDir, requestedPath));

    if (!filePath.startsWith(publicDir)) {
      sendJson(response, 403, { error: "Forbidden." });
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        sendJson(response, 404, { error: "File not found." });
        return;
      }
    } catch {
      sendJson(response, 404, { error: "File not found." });
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; connect-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'"
    });
    createReadStream(filePath).pipe(response);
  }

  return createServer(async (request, response) => {
    try {
      if (request.url?.startsWith("/api/")) {
        await handleApi(request, response);
        return;
      }
      await serveStatic(request, response);
    } catch (error) {
      const statusCode = statusCodeFor(error);
      const errorId = randomUUID();
      if (statusCode >= 500) console.error(`[${errorId}]`, error);
      sendJson(response, statusCode, {
        error: statusCode >= 500
          ? `Unexpected server error. Reference: ${errorId}`
          : error instanceof Error ? error.message : "Request failed."
      });
    }
  });
}

async function cleanupPartialFile(path: string | null): Promise<void> {
  if (!path) return;
  await unlink(path).catch(() => undefined);
}

function catalogSearchOptions(url: URL): { query: string; limit: number; offset: number } {
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length > 100) throw httpError(400, "Catalog search query is limited to 100 characters.");
  const limit = Number(url.searchParams.get("limit") ?? 25);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw httpError(400, "Catalog limit must be an integer between 1 and 100.");
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    throw httpError(400, "Catalog offset must be a non-negative integer.");
  }
  return { query, limit, offset };
}
