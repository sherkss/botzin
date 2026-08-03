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

interface VideoInfo {
  readonly id?: string;
  readonly title?: string;
  readonly webpage_url?: string;
  readonly original_url?: string;
  readonly playlist_id?: string;
  readonly language?: string;
}

interface WhisperOutput {
  readonly language?: string;
  readonly segments?: readonly { readonly start?: number; readonly end?: number; readonly text?: string }[];
}

interface IngestOptions {
  readonly knowledgeDir: string;
  readonly playlists: readonly string[];
  readonly whisperMissing: boolean;
  readonly whisperModel: string;
  readonly pythonCommand: string;
  readonly indexOnly: boolean;
}

const defaultKnowledgeDir = resolve(fileURLToPath(new URL("../../storage/knowledge", import.meta.url)));

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!options.indexOnly) await ensureTool(options.pythonCommand, "yt_dlp", ["--version"]);
  if (!options.indexOnly && options.whisperMissing) await ensureTool(options.pythonCommand, "whisper", ["--help"]);

  const rawDir = join(options.knowledgeDir, "raw");
  await mkdir(rawDir, { recursive: true });

  const store = new KnowledgeStore(options.knowledgeDir);
  if (options.indexOnly) {
    const documents = await store.readDocuments();
    if (documents.length === 0) throw new Error("Nenhum Markdown foi encontrado na pasta reviewed.");
    const index = await store.writeIndex(documents);
    console.log(`[knowledge] Índice recriado: ${index.documents} documentos e ${index.chunks.length} trechos.`);
    return;
  }

  for (const playlist of options.playlists) {
    console.log(`[knowledge] Baixando metadados e legendas: ${playlist}`);
    await run(options.pythonCommand, [
      "-m", "yt_dlp", "--ignore-errors", "--skip-download", "--write-info-json",
      "--write-subs", "--write-auto-subs", "--sub-langs", "pt-orig,pt", "--sub-format", "vtt",
      "--no-overwrites", "--output", join(rawDir, "%(playlist_id)s", "%(playlist_index)03d-%(id)s.%(ext)s"),
      playlist
    ]);
  }

  const infoPaths = await listFilesRecursive(rawDir, ".info.json");
  if (infoPaths.length === 0) {
    throw new Error("Nenhum metadado foi baixado. Verifique a rede, o yt-dlp e as URLs das playlists.");
  }

  const documentsById = new Map<string, KnowledgeDocument>();
  const baseline = curatedBaseline();
  documentsById.set(baseline.videoId, baseline);
  let skipped = 0;
  for (const infoPath of infoPaths) {
    if (basename(infoPath).startsWith("000-")) continue;
    const document = await documentFromVideo(infoPath, options);
    if (!document) {
      skipped += 1;
      continue;
    }
    if (!documentsById.has(document.videoId)) documentsById.set(document.videoId, document);
  }

  const documents = [...documentsById.values()];
  for (const document of documents) await store.saveDocument(document);
  const index = await store.writeIndex(documents);

  console.log(`[knowledge] Concluído: ${index.documents} documentos, ${index.chunks.length} trechos, ${skipped} vídeos sem texto.`);
  console.log(`[knowledge] Arquivos: ${options.knowledgeDir}`);
}

async function documentFromVideo(infoPath: string, options: IngestOptions): Promise<KnowledgeDocument | null> {
  const info = JSON.parse(await readFile(infoPath, "utf8")) as VideoInfo;
  if (!info.id) return null;

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
    console.warn(`[knowledge] Sem texto: ${info.id} — ${info.title ?? "sem título"}`);
    return null;
  }

  const document: KnowledgeDocument = {
    videoId: info.id,
    title: info.title ?? info.id,
    url: info.webpage_url ?? info.original_url ?? `https://www.youtube.com/watch?v=${info.id}`,
    playlistId: info.playlist_id ?? null,
    language,
    reviewed: false,
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
    "-m", "yt_dlp", "--extract-audio", "--audio-format", "mp3", "--no-overwrites",
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
    .filter((source) => source.metadata.kind === "playlist" && source.uri)
    .map((source) => source.uri!);
  return {
    knowledgeDir: resolve(valueAfter("--output") ?? process.env.BOTZIN_KNOWLEDGE_DIR ?? defaultKnowledgeDir),
    playlists: playlistArguments.length > 0 ? playlistArguments : seededPlaylists,
    whisperMissing: args.includes("--whisper-missing"),
    whisperModel: valueAfter("--whisper-model") ?? process.env.BOTZIN_WHISPER_MODEL ?? "small",
    pythonCommand: process.env.BOTZIN_PYTHON_COMMAND ?? "python",
    indexOnly: args.includes("--index-only")
  };
}

async function ensureTool(command: string, module: string, args: readonly string[]): Promise<void> {
  try {
    await run(command, ["-m", module, ...args], false);
  } catch {
    throw new Error(`Módulo Python "${module}" não está disponível. Instale com: python -m pip install ${module === "yt_dlp" ? "yt-dlp" : "openai-whisper"}`);
  }
}

async function run(command: string, args: readonly string[], showOutput = true): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: showOutput ? "inherit" : "ignore", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} terminou com código ${code ?? "desconhecido"}.`)));
  });
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
