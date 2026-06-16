import { createReadStream } from "node:fs";
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Busboy from "busboy";
import bcrypt from "bcryptjs";
import type { AuthenticatedConfigUser, ConfigUserRole } from "../core/config-user.js";
import { JwtService } from "../auth/jwt-service.js";
import { hasRole } from "../auth/role-policy.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import { ConfigUserRepository } from "../database/config-user-repository.js";
import { ConfigurationRepository } from "../database/configuration-repository.js";
import { createMysqlPool } from "../database/mysql-pool.js";

const config = loadRuntimeConfig();
const pool = createMysqlPool(config);
const repository = new ConfigurationRepository(pool);
const userRepository = new ConfigUserRepository(pool);
const jwtService = new JwtService(config);
const publicDir = resolve(fileURLToPath(new URL("../../public", import.meta.url)));
const storageDir = resolve(fileURLToPath(new URL("../../storage/learning-sources/videos", import.meta.url)));

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    sendJson(response, statusCode, {
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
});

server.listen(config.webPort, config.webHost, () => {
  console.log(`Configuration screen: http://${config.webHost}:${config.webPort}`);
});

async function handleApi(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;

  if (method === "POST" && pathname === "/api/auth/login") {
    sendJson(response, 200, await login(await readJson(request)));
    return;
  }

  const user = authenticate(request);

  if (method === "GET" && pathname === "/api/auth/me") {
    sendJson(response, 200, { user });
    return;
  }

  if (method === "GET" && pathname === "/api/config") {
    requireRole(user, "viewer");
    sendJson(response, 200, await repository.getSnapshot());
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
    sendJson(response, 201, await repository.createLearningMethod(await readJson(request)));
    return;
  }

  if (method === "POST" && pathname === "/api/learning-sources") {
    requireRole(user, "operator");
    sendJson(response, 201, await repository.createLearningSource(await readJson(request)));
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

  sendJson(response, 404, { error: "API route not found." });
}

async function login(payload: Record<string, unknown>): Promise<unknown> {
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!username || !password) {
    throw httpError(400, "Username and password are required.");
  }

  const user = await userRepository.findByUsername(username);
  if (!user || !user.enabled) {
    throw httpError(401, "Invalid username or password.");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw httpError(401, "Invalid username or password.");
  }

  await userRepository.markLogin(user.id);

  const safeUser: AuthenticatedConfigUser = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };

  return {
    token: jwtService.sign(safeUser),
    user: safeUser
  };
}

function authenticate(request: IncomingMessage): AuthenticatedConfigUser {
  const authorization = request.headers.authorization ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw httpError(401, "Missing Bearer token.");
  }

  try {
    return jwtService.verify(token);
  } catch {
    throw httpError(401, "Invalid or expired token.");
  }
}

function requireRole(user: AuthenticatedConfigUser, role: ConfigUserRole): void {
  if (!hasRole(user.role, role)) {
    throw httpError(403, `Role "${role}" is required.`);
  }
}

async function uploadLearningVideo(request: IncomingMessage): Promise<unknown> {
  await mkdir(storageDir, { recursive: true });

  return new Promise((resolvePromise, reject) => {
    const busboy = Busboy({
      headers: request.headers,
      limits: {
        files: 1,
        fileSize: 10 * 1024 * 1024 * 1024
      }
    });
    const fields: Record<string, string> = {};
    let storedPath: string | null = null;
    let originalFilename: string | null = null;
    let mimeType: string | null = null;
    let fileWrite: Promise<void> | null = null;

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (_name, file, info) => {
      originalFilename = info.filename;
      mimeType = info.mimeType;

      if (!isAllowedVideo(info.filename, info.mimeType)) {
        file.resume();
        reject(new Error("Video format is not allowed. Use mp4, mkv, mov, avi or webm."));
        return;
      }

      const safeName = sanitizeFilename(info.filename);
      storedPath = join(storageDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-${safeName}`);
      const writer = createWriteStream(storedPath);
      file.pipe(writer);
      fileWrite = new Promise((resolveWrite, rejectWrite) => {
        writer.on("finish", resolveWrite);
        writer.on("error", rejectWrite);
        file.on("error", rejectWrite);
      });
    });

    busboy.on("error", reject);

    busboy.on("finish", async () => {
      try {
        if (!storedPath || !fileWrite) {
          throw new Error("No video file was uploaded.");
        }

        await fileWrite;

        const source = await repository.createLearningSource({
          name: fields.name || originalFilename || basename(storedPath),
          sourceType: fields.sourceType || "video",
          uri: storedPath,
          contentHash: null,
          language: fields.language || null,
          status: "pending",
          trustLevel: fields.trustLevel || "medium",
          capturedAt: fields.capturedAt || null,
          metadataJson: JSON.stringify({
            originalFilename,
            mimeType,
            hunt: fields.hunt || null,
            quest: fields.quest || null
          }),
          notes: fields.notes || null,
          enabled: true
        });

        resolvePromise(source);
      } catch (error) {
        reject(error);
      }
    });

    request.pipe(busboy);
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

  response.writeHead(200, { "Content-Type": contentType(filePath) });
  createReadStream(filePath).pipe(response);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
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
  return (
    ["video/mp4", "video/x-matroska", "video/quicktime", "video/x-msvideo", "video/webm"].includes(mimeType) ||
    [".mp4", ".mkv", ".mov", ".avi", ".webm"].includes(extension)
  );
}

function sanitizeFilename(filename: string): string {
  const safeBase = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeBase || "hunt-video.mp4";
}

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
