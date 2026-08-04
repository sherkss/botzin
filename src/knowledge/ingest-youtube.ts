import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BASIC_GAME_KNOWLEDGE } from "../learning/basic-game-knowledge.js";
import {
  KnowledgeStore,
  listFilesRecursive,
  parseVtt,
  type KnowledgeDocument,
  type TranscriptSegment
} from "./knowledge-store.js";
import { classifySourceFreshness, extractGameVersion } from "./source-freshness.js";
import { KnowledgeFailureQueue, type KnowledgeFailureStage } from "./knowledge-failure-queue.js";

interface VideoInfo {
  readonly id?: string;
  readonly title?: string;
  readonly webpage_url?: string;
  readonly original_url?: string;
  readonly playlist_id?: string;
  readonly language?: string;
  readonly upload_date?: string;
  readonly timestamp?: number;
  readonly channel?: string;
  readonly uploader?: string;
  readonly uploader_id?: string;
}

interface WhisperOutput {
  readonly language?: string;
  readonly segments?: readonly { readonly start?: number; readonly end?: number; readonly text?: string }[];
}

interface FlatPlaylistInfo {
  readonly id?: string;
  readonly entries?: readonly VideoInfo[];
}

interface IngestOptions {
  readonly knowledgeDir: string;
  readonly playlists: readonly string[];
  readonly whisperMissing: boolean;
  readonly whisperModel: string;
  readonly pythonCommand: string;
  readonly indexOnly: boolean;
  readonly currentGameVersion: string | null;
  readonly legacyBefore: string | null;
  readonly metadataOnly: boolean;
  readonly retryFailed: boolean;
}

interface DetectedDownloadFailure {
  readonly videoId: string;
  readonly stage: "metadata" | "subtitle";
  readonly reason: string;
}

const defaultKnowledgeDir = resolve(fileURLToPath(new URL("../../storage/knowledge", import.meta.url)));
const YT_DLP_RUNTIME_ARGUMENTS = ["--js-runtimes", "node"] as const;
const YT_DLP_RATE_LIMIT_ARGUMENTS = [
  "--sleep-requests", "0.75",
  "--sleep-subtitles", "5",
  "--extractor-retries", "10",
  "--retries", "10",
  "--retry-sleep", "http:exp=5:120"
] as const;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!options.indexOnly) await ensurePythonModule(options.pythonCommand, "yt_dlp");
  if (!options.indexOnly && options.whisperMissing) {
    await ensurePythonModule(options.pythonCommand, "whisper");
    await ensureExecutable("ffmpeg", ["-version"], "FFmpeg não está disponível no PATH. Instale o FFmpeg e reabra o terminal (Chocolatey como Administrador: choco install ffmpeg -y).");
  }

  const rawDir = join(options.knowledgeDir, "raw");
  await mkdir(rawDir, { recursive: true });
  const failureQueue = await KnowledgeFailureQueue.open(join(options.knowledgeDir, "failed-videos.json"));

  const store = new KnowledgeStore(options.knowledgeDir);
  if (options.indexOnly) {
    const documents = await store.readDocuments();
    if (documents.length === 0) throw new Error("Nenhum Markdown foi encontrado na pasta reviewed.");
    const index = await store.writeIndex(documents);
    console.log(`[knowledge] Índice recriado: ${index.documents} documentos e ${index.chunks.length} trechos.`);
    return;
  }

  const manifestDocuments: KnowledgeDocument[] = [];
  const retryIds = new Set(options.retryFailed ? failureQueue.list().map((failure) => failure.videoId) : []);
  const detectedRetryFailures = new Set<string>();
  if (options.retryFailed) {
    if (retryIds.size === 0) {
      console.log("[knowledge] A fila de falhas está vazia.");
      return;
    }
    console.log(`[knowledge] Reprocessando somente ${retryIds.size} vídeo(s) da fila de falhas.`);
    for (const failure of failureQueue.list()) {
      console.log(`[knowledge] Retry ${failure.videoId} (${failure.stage}, tentativa ${failure.attempts + 1})`);
      const detected = await downloadMetadataAndSubtitles(failure.url, join(rawDir, "retry", "%(id)s.%(ext)s"), options);
      for (const item of detected) detectedRetryFailures.add(item.videoId);
      await recordDetectedFailures(failureQueue, detected);
    }
  } else {
    for (const playlist of options.playlists) {
      console.log(`[knowledge] Baixando metadados e legendas: ${playlist}`);
      if (options.metadataOnly && isYoutubeChannelUrl(playlist)) {
        manifestDocuments.push(...await documentsFromChannelManifest(playlist, options));
        continue;
      }
      const detected = await downloadMetadataAndSubtitles(
        playlist,
        join(rawDir, "%(playlist_id)s", "%(playlist_index)03d-%(id)s.%(ext)s"),
        options
      );
      await recordDetectedFailures(failureQueue, detected);
    }
  }

  const allInfoPaths = await listFilesRecursive(rawDir, ".info.json");
  const infoPaths = options.retryFailed
    ? allInfoPaths.filter((path) => [...retryIds].some((videoId) => basename(path).includes(videoId)))
    : allInfoPaths;
  if (infoPaths.length === 0 && !options.retryFailed) {
    throw new Error("Nenhum metadado foi baixado. Verifique a rede, o yt-dlp e as URLs das playlists.");
  }

  const documentsById = new Map<string, KnowledgeDocument>();
  const baseline = curatedBaseline();
  documentsById.set(baseline.videoId, baseline);
  for (const document of manifestDocuments) documentsById.set(document.videoId, document);
  let skipped = 0;
  for (const infoPath of infoPaths) {
    if (basename(infoPath).startsWith("000-")) continue;
    let info: VideoInfo | null = null;
    try {
      info = JSON.parse(await readFile(infoPath, "utf8")) as VideoInfo;
      const document = await documentFromVideo(infoPath, options);
      if (!document) {
        skipped += 1;
        if (info.id) await failureQueue.resolve(info.id);
        continue;
      }
      if (!documentsById.has(document.videoId)) documentsById.set(document.videoId, document);
      await failureQueue.resolve(document.videoId);
    } catch (error) {
      skipped += 1;
      const videoId = info?.id ?? videoIdFromPath(infoPath);
      if (videoId) {
        await failureQueue.record({
          videoId,
          url: info?.webpage_url ?? info?.original_url,
          title: info?.title ?? null,
          infoPath,
          stage: failureStage(error),
          reason: error instanceof Error ? error.message : String(error)
        });
        console.warn(`[knowledge] Falha registrada: ${videoId} — ${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }
  }

  if (options.retryFailed) {
    for (const videoId of retryIds) {
      if (infoPaths.some((path) => basename(path).includes(videoId))) continue;
      if (detectedRetryFailures.has(videoId)) continue;
      await failureQueue.record({ videoId, stage: "metadata", reason: "O retry não gerou um arquivo .info.json para o vídeo." });
    }
  }

  const documents = [...documentsById.values()];
  for (const document of documents) await store.saveDocument(document);
  const documentsForIndex = options.retryFailed ? await store.readDocuments() : documents;
  const index = await store.writeIndex(documentsForIndex);

  console.log(`[knowledge] Concluído: ${index.documents} documentos, ${index.chunks.length} trechos, ${skipped} vídeos sem texto.`);
  console.log(`[knowledge] Fila pendente: ${failureQueue.list().length} vídeo(s) em ${join(options.knowledgeDir, "failed-videos.json")}.`);
  console.log(`[knowledge] Arquivos: ${options.knowledgeDir}`);
}

async function downloadMetadataAndSubtitles(url: string, output: string, options: IngestOptions): Promise<readonly DetectedDownloadFailure[]> {
  const subtitleArguments = options.metadataOnly
    ? []
    : ["--write-subs", "--write-auto-subs", "--sub-langs", "pt-orig,pt", "--sub-format", "vtt"];
  return runYtDlp(options.pythonCommand, [
    "-m", "yt_dlp", ...YT_DLP_RUNTIME_ARGUMENTS, ...YT_DLP_RATE_LIMIT_ARGUMENTS,
    "--ignore-errors", "--skip-download", "--write-info-json",
    ...(options.metadataOnly ? ["--flat-playlist"] : []), ...subtitleArguments,
    "--no-overwrites", "--output", output, url
  ]);
}

async function recordDetectedFailures(queue: KnowledgeFailureQueue, failures: readonly DetectedDownloadFailure[]): Promise<void> {
  for (const failure of failures) {
    await queue.record({ videoId: failure.videoId, stage: failure.stage, reason: failure.reason });
  }
}

async function documentsFromChannelManifest(url: string, options: IngestOptions): Promise<KnowledgeDocument[]> {
  const output = await runCapture(options.pythonCommand, [
    "-m", "yt_dlp", ...YT_DLP_RUNTIME_ARGUMENTS, ...YT_DLP_RATE_LIMIT_ARGUMENTS,
    "--flat-playlist", "--dump-single-json", "--ignore-errors", url
  ]);
  const manifest = JSON.parse(output) as FlatPlaylistInfo;
  return (manifest.entries ?? []).flatMap((entry) => {
    if (!entry.id || !entry.title || !isSupportedTibiaHuntLevel(entry.title)) return [];
    const publishedAt = videoPublishedAt(entry);
    const gameVersion = extractGameVersion(entry.title);
    return [{
      videoId: entry.id,
      title: entry.title,
      url: entry.webpage_url ?? entry.original_url ?? `https://www.youtube.com/watch?v=${entry.id}`,
      playlistId: entry.playlist_id ?? manifest.id ?? null,
      language: "pt-BR",
      reviewed: false,
      publishedAt,
      gameVersion,
      freshness: classifySourceFreshness({
        gameVersion,
        currentGameVersion: options.currentGameVersion,
        publishedAt,
        legacyBefore: options.legacyBefore
      }),
      segments: [{ startSeconds: 0, endSeconds: 1, text: `[Metadados do vídeo] ${entry.title}` }]
    } satisfies KnowledgeDocument];
  });
}

async function documentFromVideo(infoPath: string, options: IngestOptions): Promise<KnowledgeDocument | null> {
  const info = JSON.parse(await readFile(infoPath, "utf8")) as VideoInfo;
  if (!info.id) return null;
  if (isTibiaHuntVideo(info) && !isSupportedTibiaHuntLevel(info.title ?? "")) return null;

  const stem = basename(infoPath).replace(/\.info\.json$/i, "");
  const siblingFiles = await listFilesRecursive(dirname(infoPath), ".vtt");
  const subtitlePath = siblingFiles
    .filter((path) => basename(path).startsWith(`${stem}.`))
    .sort((left, right) => subtitlePriority(left) - subtitlePriority(right))[0];
  let segments: readonly TranscriptSegment[] = [];
  let language = "pt-BR";

  if (subtitlePath) {
    segments = parseVtt(await readFile(subtitlePath, "utf8"));
    language = subtitleLanguage(subtitlePath);
  } else if (options.whisperMissing) {
    const whisper = await transcribeWithWhisper({ ...info, id: info.id }, options);
    segments = whisper.segments;
    language = whisper.language;
  }

  if (segments.length === 0) {
    const title = info.title?.trim();
    if (!title) {
      console.warn(`[knowledge] Sem texto: ${info.id} — sem título`);
      return null;
    }
    segments = [{ startSeconds: 0, endSeconds: 1, text: `[Metadados do vídeo] ${title}` }];
  }

  const document: KnowledgeDocument = {
    videoId: info.id,
    title: info.title ?? info.id,
    url: info.webpage_url ?? info.original_url ?? `https://www.youtube.com/watch?v=${info.id}`,
    playlistId: info.playlist_id ?? null,
    language,
    reviewed: false,
    publishedAt: videoPublishedAt(info),
    gameVersion: extractGameVersion(info.title ?? ""),
    freshness: classifySourceFreshness({
      gameVersion: extractGameVersion(info.title ?? ""),
      currentGameVersion: options.currentGameVersion,
      publishedAt: videoPublishedAt(info),
      legacyBefore: options.legacyBefore
    }),
    segments
  };
  const normalizedDir = join(options.knowledgeDir, "transcripts");
  await mkdir(normalizedDir, { recursive: true });
  await writeFile(join(normalizedDir, `${info.id}.knowledge.json`), JSON.stringify(document, null, 2), "utf8");
  return document;
}

async function transcribeWithWhisper(
  info: VideoInfo & { readonly id: string },
  options: IngestOptions
): Promise<{ language: string; segments: readonly TranscriptSegment[] }> {
  const url = info.webpage_url ?? info.original_url ?? `https://www.youtube.com/watch?v=${info.id}`;
  const audioDir = join(options.knowledgeDir, "audio");
  const whisperDir = join(options.knowledgeDir, "whisper");
  await mkdir(audioDir, { recursive: true });
  await mkdir(whisperDir, { recursive: true });
  await run(options.pythonCommand, [
    "-m", "yt_dlp", ...YT_DLP_RUNTIME_ARGUMENTS, ...YT_DLP_RATE_LIMIT_ARGUMENTS,
    "--extract-audio", "--audio-format", "mp3", "--no-overwrites",
    "--output", join(audioDir, `${info.id}.%(ext)s`), url
  ]);
  const audio = (await listFilesRecursive(audioDir, ".mp3")).find((path) => basename(path, extname(path)) === info.id);
  if (!audio) return { language: "pt-BR", segments: [] };

  await run(options.pythonCommand, [
    "-m", "whisper", audio, "--model", options.whisperModel, "--language", "Portuguese",
    "--task", "transcribe", "--output_format", "json", "--output_dir", whisperDir
  ]);
  const outputPath = join(whisperDir, `${info.id}.json`);
  const output = JSON.parse(await readFile(outputPath, "utf8")) as WhisperOutput;
  return {
    language: output.language ?? "pt-BR",
    segments: (output.segments ?? []).flatMap((segment) =>
      typeof segment.start === "number" && typeof segment.end === "number" && segment.text?.trim()
        ? [{ startSeconds: segment.start, endSeconds: segment.end, text: segment.text.trim() }]
        : []
    )
  };
}

function curatedBaseline(): KnowledgeDocument {
  const source = BASIC_GAME_KNOWLEDGE.find((item) => item.metadata.kind === "curated-baseline");
  const lines = source?.notes.split("\n").filter(Boolean) ?? [];
  return {
    videoId: "botzin-basic-principles-v1",
    title: source?.name ?? "Princípios básicos e seguros de jogo",
    url: "",
    playlistId: null,
    language: "pt-BR",
    reviewed: true,
    segments: lines.map((text, index) => ({ startSeconds: index, endSeconds: index + 1, text }))
  };
}

function parseOptions(args: readonly string[]): IngestOptions {
  const valueAfter = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const playlistArguments = args.filter((argument, index) => args[index - 1] === "--playlist" && argument);
  const seededPlaylists = BASIC_GAME_KNOWLEDGE
    .filter((source) => (source.metadata.kind === "playlist" || source.metadata.kind === "channel") && source.uri)
    .map((source) => source.uri!);
  return {
    knowledgeDir: resolve(valueAfter("--output") ?? process.env.BOTZIN_KNOWLEDGE_DIR ?? defaultKnowledgeDir),
    playlists: playlistArguments.length > 0 ? playlistArguments : seededPlaylists,
    whisperMissing: args.includes("--whisper-missing"),
    whisperModel: valueAfter("--whisper-model") ?? process.env.BOTZIN_WHISPER_MODEL ?? "small",
    pythonCommand: process.env.BOTZIN_PYTHON_COMMAND ?? "python",
    indexOnly: args.includes("--index-only"),
    currentGameVersion: valueAfter("--current-version") ?? process.env.BOTZIN_TIBIA_VERSION ?? null,
    legacyBefore: valueAfter("--legacy-before") ?? process.env.BOTZIN_KNOWLEDGE_LEGACY_BEFORE ?? null,
    metadataOnly: args.includes("--metadata-only"),
    retryFailed: args.includes("--retry-failed")
  };
}

function videoIdFromPath(path: string): string | null {
  return basename(path).match(/([A-Za-z0-9_-]{11})(?=\.info\.json$)/)?.[1] ?? null;
}

function failureStage(error: unknown): KnowledgeFailureStage {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("whisper") || message.includes("audio") || message.includes("ffmpeg")) return "transcription";
  return "document";
}

function videoPublishedAt(info: VideoInfo): string | null {
  if (info.upload_date && /^\d{8}$/.test(info.upload_date)) {
    return `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}`;
  }
  return typeof info.timestamp === "number" ? new Date(info.timestamp * 1000).toISOString().slice(0, 10) : null;
}

function isTibiaHuntVideo(info: VideoInfo): boolean {
  const identity = `${info.channel ?? ""} ${info.uploader ?? ""} ${info.uploader_id ?? ""}`.toLowerCase();
  return identity.replace(/\s+/g, "").includes("tibiahunt");
}

function isSupportedTibiaHuntLevel(title: string): boolean {
  return /\b(?:EK|ED|MS|RP|EM)\s*\d{1,6}\b/i.test(title);
}

async function ensurePythonModule(command: string, module: string): Promise<void> {
  try {
    await run(command, ["-c", `import ${module}`], false);
  } catch {
    throw new Error(`Módulo Python "${module}" não está disponível. Instale com: python -m pip install ${module === "yt_dlp" ? "yt-dlp" : "openai-whisper"}`);
  }
}

async function ensureExecutable(command: string, args: readonly string[], errorMessage: string): Promise<void> {
  try {
    await run(command, args, false);
  } catch {
    throw new Error(errorMessage);
  }
}

function subprocessEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };
}

async function run(command: string, args: readonly string[], showOutput = true): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: showOutput ? "inherit" : "ignore", windowsHide: true, env: subprocessEnvironment() });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} terminou com código ${code ?? "desconhecido"}.`)));
  });
}

async function runCapture(command: string, args: readonly string[]): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: subprocessEnvironment() });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(`${command} terminou com código ${code ?? "desconhecido"}: ${Buffer.concat(stderr).toString("utf8").slice(-1000)}`));
    });
  });
}

async function runYtDlp(command: string, args: readonly string[]): Promise<readonly DetectedDownloadFailure[]> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: subprocessEnvironment() });
    const failures = new Map<string, DetectedDownloadFailure>();
    let currentVideoId: string | null = null;
    let stdoutRemainder = "";
    let stderrRemainder = "";

    const inspectLine = (rawLine: string): void => {
      const line = rawLine.replace(/\u001b\[[0-9;]*m/g, "");
      const identity = line.match(/\[youtube\]\s+([A-Za-z0-9_-]{11}):/);
      if (identity) currentVideoId = identity[1];
      const directError = line.match(/ERROR:\s*\[youtube\]\s+([A-Za-z0-9_-]{11}):\s*(.+)/i);
      if (directError) {
        failures.set(directError[1], { videoId: directError[1], stage: "metadata", reason: directError[2].trim() });
      } else if (currentVideoId && /WARNING:.*(?:subtitle|subtitles).*?(?:HTTP Error|Unable to download)/i.test(line)) {
        failures.set(currentVideoId, { videoId: currentVideoId, stage: "subtitle", reason: line.trim() });
      }
    };
    const consume = (chunk: Buffer, stderr: boolean): void => {
      const value = (stderr ? stderrRemainder : stdoutRemainder) + chunk.toString("utf8");
      const lines = value.split(/\r?\n/);
      const remainder = lines.pop() ?? "";
      if (stderr) stderrRemainder = remainder; else stdoutRemainder = remainder;
      for (const line of lines) inspectLine(line);
      (stderr ? process.stderr : process.stdout).write(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => consume(chunk, false));
    child.stderr.on("data", (chunk: Buffer) => consume(chunk, true));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (stdoutRemainder) inspectLine(stdoutRemainder);
      if (stderrRemainder) inspectLine(stderrRemainder);
      if (code !== 0 && failures.size === 0) {
        reject(new Error(`${command} terminou com código ${code ?? "desconhecido"}.`));
        return;
      }
      resolvePromise([...failures.values()]);
    });
  });
}

function isYoutubeChannelUrl(value: string): boolean {
  return /^https?:\/\/(?:www\.)?youtube\.com\/@[^/]+(?:\/videos)?/i.test(value);
}

function subtitleLanguage(path: string): string {
  const match = basename(path).match(/\.([a-z]{2}(?:-[A-Za-z]{2})?)\.vtt$/);
  return match?.[1] ?? "pt-BR";
}

function subtitlePriority(path: string): number {
  const name = basename(path).toLowerCase();
  if (name.endsWith(".pt-orig.vtt")) return 0;
  if (name.endsWith(".pt.vtt")) return 1;
  if (name.endsWith(".pt-pt.vtt")) return 2;
  return 10;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
