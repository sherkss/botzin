import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { KnowledgeStore, type KnowledgeDocument, type TranscriptSegment } from "./knowledge-store.js";
import type { VisualTrainingFrame, VisualTrainingVideo } from "./visual-training-dataset.js";

export interface VisualFrameObservation {
  readonly frameIndex: number;
  readonly timestampSeconds: number;
  readonly scene: string;
  readonly combat: boolean;
  readonly playerCount: number | null;
  readonly creatures: readonly string[];
  readonly spellsOrRunes: readonly string[];
  readonly visibleText: readonly string[];
  readonly minimapOrRoute: string | null;
  readonly sessionStats: {
    readonly xpPerHour: number | null;
    readonly rawXpPerHour: number | null;
    readonly profit: number | null;
  };
  readonly confidence: number;
  readonly notes: string;
}

export interface VisualHuntReport {
  readonly version: 1;
  readonly videoId: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly model: string;
  readonly analyzedAt: string;
  readonly totalFrames: number;
  readonly combatFrames: number;
  readonly creatures: readonly { readonly name: string; readonly occurrences: number }[];
  readonly spellsOrRunes: readonly { readonly name: string; readonly occurrences: number }[];
  readonly observations: readonly VisualFrameObservation[];
}

export interface LocalVisualAnalyzerOptions {
  readonly visualTrainingRoot: string;
  readonly knowledgeRoot: string;
  readonly ollamaUrl: string;
  readonly model: string;
  readonly batchSize: number;
  readonly concurrency: number;
  readonly retries: number;
  readonly requestTimeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

interface OllamaChatResponse {
  readonly message?: { readonly content?: string };
  readonly done_reason?: string;
}

const observationSchema = {
  type: "object",
  properties: {
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          frameIndex: { type: "integer" },
          timestampSeconds: { type: "number" },
          scene: { type: "string" },
          combat: { type: "boolean" },
          playerCount: { anyOf: [{ type: "integer" }, { type: "null" }] },
          creatures: { type: "array", items: { type: "string" } },
          spellsOrRunes: { type: "array", items: { type: "string" } },
          visibleText: { type: "array", items: { type: "string" } },
          minimapOrRoute: { anyOf: [{ type: "string" }, { type: "null" }] },
          sessionStats: {
            type: "object",
            properties: {
              xpPerHour: { anyOf: [{ type: "number" }, { type: "null" }] },
              rawXpPerHour: { anyOf: [{ type: "number" }, { type: "null" }] },
              profit: { anyOf: [{ type: "number" }, { type: "null" }] }
            },
            required: ["xpPerHour", "rawXpPerHour", "profit"]
          },
          confidence: { type: "number" },
          notes: { type: "string" }
        },
        required: ["frameIndex", "timestampSeconds", "scene", "combat", "playerCount", "creatures", "spellsOrRunes", "visibleText", "minimapOrRoute", "sessionStats", "confidence", "notes"]
      }
    }
  },
  required: ["observations"]
} as const;

export async function ensureLocalVisualModel(options: LocalVisualAnalyzerOptions): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${normalizedUrl(options.ollamaUrl)}/api/tags`).catch(() => null);
  if (!response?.ok) throw new Error("O Ollama local não está acessível. Instale/inicie o Ollama antes da análise visual.");
  const payload = await response.json() as { models?: readonly { name?: string; model?: string }[] };
  const names = (payload.models ?? []).flatMap((item) => [item.name, item.model]).filter(Boolean);
  if (!names.some((name) => name === options.model || name?.startsWith(`${options.model}:`))) {
    throw new Error(`Modelo visual local ausente. Execute: ollama pull ${options.model}`);
  }
}

export async function analyzeVisualTrainingVideo(
  video: VisualTrainingVideo,
  options: LocalVisualAnalyzerOptions
): Promise<{ readonly video: VisualTrainingVideo; readonly report: VisualHuntReport }> {
  const analysisDirectory = join(options.visualTrainingRoot, "analysis", video.videoId);
  const checkpointDirectory = join(analysisDirectory, "frames");
  await mkdir(checkpointDirectory, { recursive: true });
  const existing = await loadCheckpoints(checkpointDirectory);
  const pending = video.frames.filter((frame) => !existing.has(frame.index));
  const batches = chunk(pending, options.batchSize);
  let completed = existing.size;

  await runConcurrent(batches, options.concurrency, async (batch) => {
    const observations = await analyzeBatch(video, batch, options);
    for (const observation of observations) {
      await writeJsonAtomic(join(checkpointDirectory, `${String(observation.frameIndex).padStart(6, "0")}.json`), observation);
      existing.set(observation.frameIndex, observation);
    }
    completed += observations.length;
    console.log(`[visual-ai] ${video.videoId}: ${completed}/${video.frames.length} quadros analisados.`);
  });

  const observations = video.frames.map((frame) => existing.get(frame.index)).filter((item): item is VisualFrameObservation => Boolean(item));
  if (observations.length !== video.frames.length) throw new Error(`Análise incompleta: ${observations.length}/${video.frames.length} quadros.`);
  const report = buildReport(video, options.model, observations);
  const reportPath = join(analysisDirectory, "hunt-report.json");
  await writeJsonAtomic(reportPath, report);
  await indexReport(video, report, options.knowledgeRoot);
  return {
    video: {
      ...video,
      analysisStatus: "complete",
      analysisPath: relative(options.visualTrainingRoot, reportPath).replaceAll("\\", "/"),
      analyzedFrames: observations.length,
      analyzedAt: report.analyzedAt
    },
    report
  };
}

async function analyzeBatch(video: VisualTrainingVideo, frames: readonly VisualTrainingFrame[], options: LocalVisualAnalyzerOptions): Promise<VisualFrameObservation[]> {
  const images = await Promise.all(frames.map(async (frame) => (await readFile(visualArtifactPath(options.visualTrainingRoot, frame.path))).toString("base64")));
  const frameList = frames.map((frame, index) => `Imagem ${index + 1}: frameIndex=${frame.index}, timestampSeconds=${frame.timestampSeconds}`).join("\n");
  const prompt = `Analise TODOS os quadros de Tibia anexados, um resultado por imagem e na mesma ordem. Não invente nomes ou números ilegíveis; use listas vazias/null e reduza confidence. Observe combate, criaturas, jogadores, magias/runas, texto da interface, minimapa/rota, XP/h, raw XP/h e profit. Responda em português brasileiro.\nVídeo: ${video.title}\n${frameList}`;
  const body = {
    model: options.model,
    stream: false,
    keep_alive: "10m",
    format: observationSchema,
    options: { temperature: 0, num_predict: 1_024 },
    messages: [{ role: "user", content: prompt, images }]
  };
  const errors: string[] = [];
  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    try {
      const payload = options.fetcher
        ? await fetchOllamaChat(`${normalizedUrl(options.ollamaUrl)}/api/chat`, body, options.fetcher)
        : await requestOllamaChat(`${normalizedUrl(options.ollamaUrl)}/api/chat`, body, options.requestTimeoutMs ?? 1_200_000);
      if (payload.done_reason === "length") throw new Error("Ollama atingiu o limite de resposta antes de concluir o JSON.");
      const parsed = JSON.parse(payload.message?.content ?? "") as { observations?: unknown[] };
      return normalizeObservations(parsed.observations, frames);
    } catch (error) {
      errors.push(errorMessageWithCause(error));
      if (attempt < options.retries) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 1_000));
    }
  }
  throw new Error(`Falha do Ollama após ${options.retries} tentativa(s): ${errors.join(" | ")}`);
}

async function fetchOllamaChat(url: string, body: unknown, fetcher: typeof fetch): Promise<OllamaChatResponse> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  return response.json() as Promise<OllamaChatResponse>;
}

async function requestOllamaChat(urlValue: string, body: unknown, timeoutMs: number): Promise<OllamaChatResponse> {
  const url = new URL(urlValue);
  const encodedBody = JSON.stringify(body);
  const requestFunction = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<OllamaChatResponse>((resolvePromise, reject) => {
    const request = requestFunction(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(encodedBody)
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("error", reject);
      response.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`Ollama HTTP ${statusCode}: ${responseBody.slice(0, 2_000)}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(responseBody) as OllamaChatResponse);
        } catch (error) {
          reject(new Error(`Resposta HTTP inválida do Ollama: ${errorMessageWithCause(error)}`));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Ollama excedeu o timeout local de ${timeoutMs}ms.`)));
    request.on("error", reject);
    request.end(encodedBody);
  });
}

function normalizeObservations(values: unknown, frames: readonly VisualTrainingFrame[]): VisualFrameObservation[] {
  if (!Array.isArray(values) || values.length !== frames.length) throw new Error("O modelo retornou uma quantidade incorreta de observações.");
  return frames.map((frame, index) => {
    const value = values[index] as Partial<VisualFrameObservation> | undefined;
    if (!value || typeof value.scene !== "string") throw new Error(`Observação inválida para o quadro ${frame.index}.`);
    return {
      frameIndex: frame.index,
      timestampSeconds: frame.timestampSeconds,
      scene: value.scene,
      combat: value.combat === true,
      playerCount: integerOrNull(value.playerCount),
      creatures: stringArray(value.creatures),
      spellsOrRunes: stringArray(value.spellsOrRunes),
      visibleText: stringArray(value.visibleText),
      minimapOrRoute: typeof value.minimapOrRoute === "string" ? value.minimapOrRoute : null,
      sessionStats: {
        xpPerHour: numberOrNull(value.sessionStats?.xpPerHour),
        rawXpPerHour: numberOrNull(value.sessionStats?.rawXpPerHour),
        profit: numberOrNull(value.sessionStats?.profit)
      },
      confidence: Math.max(0, Math.min(1, typeof value.confidence === "number" ? value.confidence : 0)),
      notes: typeof value.notes === "string" ? value.notes : ""
    };
  });
}

function buildReport(video: VisualTrainingVideo, model: string, observations: readonly VisualFrameObservation[]): VisualHuntReport {
  return {
    version: 1,
    videoId: video.videoId,
    title: video.title,
    sourceUrl: video.sourceUrl,
    model,
    analyzedAt: new Date().toISOString(),
    totalFrames: observations.length,
    combatFrames: observations.filter((item) => item.combat).length,
    creatures: frequencies(observations.flatMap((item) => item.creatures)),
    spellsOrRunes: frequencies(observations.flatMap((item) => item.spellsOrRunes)),
    observations
  };
}

async function indexReport(video: VisualTrainingVideo, report: VisualHuntReport, knowledgeRoot: string): Promise<void> {
  const segments: TranscriptSegment[] = report.observations.map((item) => ({
    startSeconds: item.timestampSeconds,
    endSeconds: item.timestampSeconds + video.frameIntervalSeconds,
    text: [item.scene || "Quadro analisado sem elementos legíveis.", item.combat ? "Combate ativo." : "", item.creatures.length ? `Criaturas: ${item.creatures.join(", ")}.` : "", item.spellsOrRunes.length ? `Magias/runas: ${item.spellsOrRunes.join(", ")}.` : "", item.minimapOrRoute ? `Rota: ${item.minimapOrRoute}.` : "", item.sessionStats.xpPerHour !== null ? `XP/h: ${item.sessionStats.xpPerHour}.` : "", item.sessionStats.rawXpPerHour !== null ? `Raw XP/h: ${item.sessionStats.rawXpPerHour}.` : "", item.sessionStats.profit !== null ? `Profit: ${item.sessionStats.profit}.` : "", item.notes].filter(Boolean).join(" ")
  }));
  const document: KnowledgeDocument = {
    videoId: `visual-${video.videoId}`,
    title: `[Análise visual] ${video.title}`,
    url: video.sourceUrl,
    playlistId: null,
    language: "pt-BR",
    reviewed: false,
    publishedAt: video.publishedAt,
    segments
  };
  const store = new KnowledgeStore(knowledgeRoot);
  await store.saveDocument(document);
  await store.writeIndex(await store.readDocuments());
}

async function loadCheckpoints(directory: string): Promise<Map<number, VisualFrameObservation>> {
  const output = new Map<number, VisualFrameObservation>();
  for (const name of await readdir(directory).catch(() => [])) {
    if (!name.endsWith(".json")) continue;
    const value = JSON.parse(await readFile(join(directory, name), "utf8")) as VisualFrameObservation;
    if (Number.isInteger(value.frameIndex)) output.set(value.frameIndex, value);
  }
  return output;
}

async function runConcurrent<T>(values: readonly T[], concurrency: number, task: (value: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      await task(values[index]!);
    }
  }));
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function frequencies(values: readonly string[]): { name: string; occurrences: number }[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = raw.trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([name, occurrences]) => ({ name, occurrences })).sort((left, right) => right.occurrences - left.occurrences);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function errorMessageWithCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` — ${error.cause.message}` : error.cause ? ` — ${String(error.cause)}` : "";
  return `${error.message}${cause}`;
}

export function visualArtifactPath(root: string, path: string): string {
  if (isAbsolute(path)) throw new Error(`Caminho visual absoluto não permitido: ${path}`);
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, path);
  const child = relative(resolvedRoot, target);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`Caminho visual fora do dataset: ${path}`);
  }
  return target;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
}
