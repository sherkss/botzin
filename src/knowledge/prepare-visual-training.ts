import { mkdir, readFile, readdir, rm, unlink } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  VisualTrainingDataset,
  type VisualTrainingFrame,
  type VisualTrainingVideo
} from "./visual-training-dataset.js";
import { analyzeVisualTrainingVideo, ensureLocalVisualModel, visualArtifactPath, type LocalVisualAnalyzerOptions } from "./local-visual-hunt-analyzer.js";
import { loadExistingVideoSources } from "./visual-training-sources.js";

interface SourceEntry {
  readonly id?: string;
  readonly title?: string;
  readonly url?: string;
  readonly webpage_url?: string;
  readonly original_url?: string;
}

interface SourceManifest extends SourceEntry {
  readonly entries?: readonly SourceEntry[];
}

interface VideoInfo extends SourceEntry {
  readonly uploader?: string;
  readonly channel?: string;
  readonly upload_date?: string;
  readonly duration?: number;
}

interface Options {
  readonly sourceUrl: string | null;
  readonly outputRoot: string;
  readonly knowledgeRoot: string;
  readonly limit: number;
  readonly frameIntervalSeconds: number;
  readonly maxHeight: number;
  readonly retryFailed: boolean;
  readonly keepVideo: boolean;
  readonly analyzeLocal: boolean;
  readonly keepFrames: boolean;
  readonly visualModel: string;
  readonly ollamaUrl: string;
  readonly visualBatchSize: number;
  readonly visualConcurrency: number;
  readonly force: boolean;
  readonly pythonCommand: string;
}

const defaultOutputRoot = resolve(fileURLToPath(new URL("../../storage/knowledge/visual-training", import.meta.url)));
const defaultKnowledgeRoot = resolve(fileURLToPath(new URL("../../storage/knowledge", import.meta.url)));
const videoExtensions = new Set([".mp4", ".mkv", ".webm", ".mov"]);
const ytDlpCommon = [
  "--js-runtimes", "node",
  "--sleep-requests", "0.75",
  "--extractor-retries", "10",
  "--retries", "10",
  "--retry-sleep", "http:exp=5:120"
] as const;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  await ensureCommand(options.pythonCommand, ["-c", "import yt_dlp"], 'Módulo Python "yt_dlp" indisponível. Execute: python -m pip install -U yt-dlp');
  await ensureCommand("ffmpeg", ["-version"], "FFmpeg não está disponível no PATH.");

  const dataset = await VisualTrainingDataset.open(options.outputRoot);
  const analyzerOptions: LocalVisualAnalyzerOptions = {
    visualTrainingRoot: options.outputRoot,
    knowledgeRoot: options.knowledgeRoot,
    ollamaUrl: options.ollamaUrl,
    model: options.visualModel,
    batchSize: options.visualBatchSize,
    concurrency: options.visualConcurrency,
    retries: 3
  };
  if (options.analyzeLocal) await ensureLocalVisualModel(analyzerOptions);
  const completedVideoIds = new Set(dataset.listVideos()
    .filter((video) => video.analysisStatus === "complete")
    .map((video) => video.videoId));
  const discoveredEntries: readonly SourceEntry[] = options.retryFailed
    ? dataset.listFailures().map((failure) => ({ id: failure.videoId, title: failure.title, webpage_url: failure.sourceUrl }))
    : options.sourceUrl
      ? await discoverEntries(
        options.sourceUrl,
        options,
        options.analyzeLocal && !options.force ? options.limit + completedVideoIds.size : options.limit
      )
      : await loadExistingVideoSources(join(options.knowledgeRoot, "raw"));
  const entries = options.analyzeLocal && !options.force && !options.retryFailed
    ? discoveredEntries.filter((entry) => !entry.id || !completedVideoIds.has(entry.id)).slice(0, options.limit)
    : discoveredEntries.slice(0, options.limit);

  if (entries.length === 0) {
    console.log(options.retryFailed ? "[visual] A fila de falhas está vazia." : "[visual] Nenhum vídeo novo para processar.");
    return;
  }

  if (!options.sourceUrl && !options.retryFailed) {
    console.log(`[visual] Usando fila automática dos metadados existentes em ${join(options.knowledgeRoot, "raw")}.`);
  }

  console.log(`[visual] Preparando ${entries.length} vídeo(s), com um quadro a cada ${options.frameIntervalSeconds}s.`);
  for (const [position, entry] of entries.entries()) {
    if (!entry.id) continue;
    if (options.analyzeLocal && !options.force && completedVideoIds.has(entry.id)) {
      console.log(`[visual] Ignorado: ${entry.id} já possui análise visual completa. Use --force para refazer.`);
      continue;
    }
    const sourceUrl = entry.webpage_url ?? entry.original_url ?? entry.url ?? `https://www.youtube.com/watch?v=${entry.id}`;
    const title = entry.title ?? entry.id;
    console.log(`[visual] ${position + 1}/${entries.length}: ${title} (${entry.id})`);
    try {
      let prepared = await prepareVideo({ videoId: entry.id, title, sourceUrl }, options);
      await dataset.complete(prepared);
      if (options.analyzeLocal) {
        prepared = (await analyzeVisualTrainingVideo(prepared, analyzerOptions)).video;
        await dataset.complete(prepared);
        if (!options.keepFrames) {
          await rm(visualArtifactPath(options.outputRoot, prepared.framesDirectory), { recursive: true, force: true });
          prepared = { ...prepared, framesDeletedAfterAnalysis: true };
          await dataset.complete(prepared);
        }
      }
      if (!options.keepVideo && prepared.videoPath) {
        await unlink(join(options.outputRoot, prepared.videoPath));
        prepared = { ...prepared, videoPath: null, sourceVideoDeleted: true };
        await dataset.complete(prepared);
        console.log(`[visual] Vídeo-fonte removido após a preparação: ${entry.id}.`);
      }
      console.log(`[visual] Pronto: ${entry.id}, ${prepared.frames.length} quadros.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await dataset.fail({ videoId: entry.id, title, sourceUrl, reason });
      console.warn(`[visual] Falha registrada: ${entry.id} — ${reason}`);
    }
  }

  console.log(`[visual] Dataset: ${options.outputRoot}`);
  console.log(`[visual] Preparados: ${dataset.listVideos().length}; falhas pendentes: ${dataset.listFailures().length}.`);
}

async function discoverEntries(sourceUrl: string, options: Options, discoveryLimit: number): Promise<readonly SourceEntry[]> {
  const output = await runCapture(options.pythonCommand, [
    "-m", "yt_dlp", ...ytDlpCommon, "--flat-playlist", "--dump-single-json", "--playlist-end", String(discoveryLimit), sourceUrl
  ]);
  const manifest = JSON.parse(output) as SourceManifest;
  const entries = manifest.entries ?? [manifest];
  return entries.filter((entry): entry is SourceEntry & { id: string } => Boolean(entry.id)).slice(0, discoveryLimit);
}

async function prepareVideo(
  source: { videoId: string; title: string; sourceUrl: string },
  options: Options
): Promise<VisualTrainingVideo> {
  const videoDirectory = join(options.outputRoot, "videos", source.videoId);
  const framesDirectory = join(options.outputRoot, "frames", source.videoId);
  await Promise.all([mkdir(videoDirectory, { recursive: true }), mkdir(framesDirectory, { recursive: true })]);

  await run(options.pythonCommand, [
    "-m", "yt_dlp", ...ytDlpCommon, "--no-playlist",
    "--format", `bestvideo[height<=${options.maxHeight}]+bestaudio/best[height<=${options.maxHeight}]/best`,
    "--merge-output-format", "mp4", "--write-info-json", "--no-overwrites",
    "--output", join(videoDirectory, "source.%(ext)s"), source.sourceUrl
  ]);

  const files = await readdir(videoDirectory);
  const videoName = files.find((name) => videoExtensions.has(extname(name).toLowerCase()));
  const infoName = files.find((name) => name.endsWith(".info.json"));
  if (!videoName) throw new Error("O yt-dlp não gerou um arquivo de vídeo.");
  if (!infoName) throw new Error("O yt-dlp não gerou os metadados do vídeo.");
  const videoPath = join(videoDirectory, videoName);
  const info = JSON.parse(await readFile(join(videoDirectory, infoName), "utf8")) as VideoInfo;

  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", videoPath,
    "-vf", `fps=1/${options.frameIntervalSeconds},scale=-2:'min(${options.maxHeight},ih)'`,
    "-q:v", "3", join(framesDirectory, "frame-%06d.jpg")
  ]);

  const frameNames = (await readdir(framesDirectory)).filter((name) => /^frame-\d{6}\.jpg$/i.test(name)).sort();
  if (frameNames.length === 0) throw new Error("O FFmpeg não extraiu quadros do vídeo.");
  const frames: VisualTrainingFrame[] = frameNames.map((name, index) => ({
    index: index + 1,
    timestampSeconds: Number((index * options.frameIntervalSeconds).toFixed(3)),
    path: relative(options.outputRoot, join(framesDirectory, name)).replaceAll("\\", "/")
  }));

  return {
    videoId: source.videoId,
    title: info.title ?? source.title,
    sourceUrl: info.webpage_url ?? info.original_url ?? source.sourceUrl,
    uploader: info.uploader ?? info.channel ?? null,
    publishedAt: publishedAt(info.upload_date),
    durationSeconds: typeof info.duration === "number" ? info.duration : null,
    frameIntervalSeconds: options.frameIntervalSeconds,
    videoPath: relative(options.outputRoot, videoPath).replaceAll("\\", "/"),
    sourceVideoDeleted: false,
    framesDirectory: relative(options.outputRoot, framesDirectory).replaceAll("\\", "/"),
    frames,
    preparedAt: new Date().toISOString(),
    analysisStatus: "pending",
    analysisPath: null,
    analyzedFrames: 0,
    analyzedAt: null,
    framesDeletedAfterAnalysis: false
  };
}

function parseOptions(args: readonly string[]): Options {
  const valueAfter = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    sourceUrl: valueAfter("--url") ?? valueAfter("--playlist") ?? null,
    outputRoot: resolve(valueAfter("--output") ?? process.env.BOTZIN_VISUAL_TRAINING_DIR ?? defaultOutputRoot),
    knowledgeRoot: resolve(valueAfter("--knowledge-output") ?? process.env.BOTZIN_KNOWLEDGE_DIR ?? defaultKnowledgeRoot),
    limit: positiveInteger(valueAfter("--limit"), 1, "--limit"),
    frameIntervalSeconds: positiveNumber(valueAfter("--frame-interval"), 2, "--frame-interval"),
    maxHeight: positiveInteger(valueAfter("--max-height"), 720, "--max-height"),
    retryFailed: args.includes("--retry-failed"),
    keepVideo: args.includes("--keep-video"),
    analyzeLocal: args.includes("--analyze-local"),
    keepFrames: args.includes("--keep-frames"),
    visualModel: valueAfter("--model") ?? process.env.BOTZIN_VISUAL_MODEL ?? "gemma3:4b",
    ollamaUrl: process.env.BOTZIN_OLLAMA_URL ?? "http://127.0.0.1:11434",
    visualBatchSize: positiveInteger(valueAfter("--batch-size") ?? process.env.BOTZIN_VISUAL_BATCH_SIZE, 4, "--batch-size"),
    visualConcurrency: positiveInteger(valueAfter("--concurrency") ?? process.env.BOTZIN_VISUAL_CONCURRENCY, 1, "--concurrency"),
    force: args.includes("--force"),
    pythonCommand: process.env.BOTZIN_PYTHON_COMMAND ?? "python"
  };
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} precisa ser um número inteiro maior que zero.`);
  return parsed;
}

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} precisa ser um número maior que zero.`);
  return parsed;
}

function publishedAt(value: string | undefined): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function subprocessEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };
}

async function ensureCommand(command: string, args: readonly string[], message: string): Promise<void> {
  try {
    await run(command, args, false);
  } catch {
    throw new Error(message);
  }
}

async function run(command: string, args: readonly string[], showOutput = true): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: showOutput ? "inherit" : "ignore",
      windowsHide: true,
      env: subprocessEnvironment()
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`${basename(command)} terminou com código ${code ?? "desconhecido"}.`)));
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
    child.on("exit", (code) => code === 0
      ? resolvePromise(Buffer.concat(stdout).toString("utf8"))
      : reject(new Error(Buffer.concat(stderr).toString("utf8") || `${basename(command)} terminou com código ${code ?? "desconhecido"}.`)));
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
