/**
 * Runs the visual-training preparation over every queued learning source.
 *
 * ``prepare-visual-training`` takes one source at a time and defaults to
 * ``--limit 1``, which is why the queue in ``bot_learning_sources`` never drained:
 * each invocation fetched a single video. This walks the queue instead, expanding
 * channels and playlists, and passes ``--skip-prepared`` so an interrupted run
 * resumes rather than re-downloading what is already on disk.
 *
 * Source videos are removed after their frames are extracted, so disk grows with
 * frames only.
 *
 * Usage:
 *   npx tsx --env-file-if-exists=.env scripts/download-all-videos.ts [--limit 200] [--dry-run]
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createConnection } from "mysql2/promise";

interface QueuedSource {
  readonly id: number;
  readonly name: string;
  readonly uri: string;
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const perSourceLimit = Number(valueAfter("--limit") ?? 200);
const frameInterval = valueAfter("--frame-interval") ?? "2";
const dryRun = process.argv.includes("--dry-run");

const QUEUE_CACHE = resolve("storage/knowledge/video-queue.json");

/**
 * The queue lives in the database, but a download run lasts hours and the MySQL
 * container has died mid-run before. Caching the queue on disk means a database
 * outage no longer takes the download with it.
 */
async function loadQueue(): Promise<readonly QueuedSource[]> {
  try {
    const connection = await createConnection({
      host: process.env.BOTZIN_MYSQL_HOST ?? "127.0.0.1",
      port: Number(process.env.BOTZIN_MYSQL_PORT ?? 3306),
      user: process.env.BOTZIN_MYSQL_USER ?? "botzin",
      password: process.env.BOTZIN_MYSQL_PASSWORD ?? "",
      database: process.env.BOTZIN_MYSQL_DATABASE ?? "botzin",
      connectTimeout: 10_000,
    });
    try {
      const [rows] = await connection.query(
        `SELECT id, name, uri FROM bot_learning_sources
          WHERE enabled = 1 AND uri IS NOT NULL AND uri LIKE '%youtube.com%'
          ORDER BY id`
      );
      const sources = rows as QueuedSource[];
      await mkdir(dirname(QUEUE_CACHE), { recursive: true });
      await writeFile(QUEUE_CACHE, JSON.stringify({ updatedAt: new Date().toISOString(), sources }, null, 2), "utf8");
      return sources;
    } finally {
      await connection.end();
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[queue] banco indisponível (${reason}); usando a fila em cache`);
    const cached = JSON.parse(await readFile(QUEUE_CACHE, "utf8")) as { sources: QueuedSource[] };
    console.warn(`[queue] cache de ${QUEUE_CACHE}`);
    return cached.sources;
  }
}

const TSX_CLI = resolve("node_modules/tsx/dist/cli.mjs");

function runPrepare(source: QueuedSource): Promise<number> {
  return new Promise((resolvePromise) => {
    // No shell: YouTube URLs carry "&", which cmd.exe treats as a command separator.
    // Through a shell the URL was truncated at the first "&" - dropping the playlist
    // id, so playlists collapsed to a single video - and every flag after it was
    // discarded, including --skip-prepared, so finished videos were downloaded again.
    const child = spawn(process.execPath, [
      TSX_CLI, "--env-file-if-exists=.env", "src/knowledge/prepare-visual-training.ts",
      "--url", source.uri,
      "--limit", String(perSourceLimit),
      "--frame-interval", frameInterval,
      "--skip-prepared",
    ], { stdio: "inherit", shell: false });
    child.on("close", (code) => resolvePromise(code ?? 1));
  });
}

const all = await loadQueue();
// Re-discovering finished sources costs minutes per restart, which matters when a
// run is interrupted often. --only/--from resume straight at the source still working.
const only = valueAfter("--only");
const from = Number(valueAfter("--from") ?? 0);
const queue = only
  ? all.filter((source) => String(source.id) === only)
  : from > 0 ? all.filter((source) => source.id >= from) : all;
console.log(`[queue] ${queue.length} de ${all.length} fontes do YouTube, até ${perSourceLimit} vídeos por fonte`);

if (dryRun) {
  for (const source of queue) console.log(`  ${source.id}  ${source.name}\n      ${source.uri}`);
  process.exit(0);
}

let failed = 0;
for (const [position, source] of queue.entries()) {
  console.log(`\n[queue] ${position + 1}/${queue.length}  id=${source.id}  ${source.name}`);
  const code = await runPrepare(source);
  // One bad source must not abort the queue; the video dataset records its own
  // per-video failures for a later --retry-failed pass.
  if (code !== 0) {
    failed += 1;
    console.warn(`[queue] fonte ${source.id} terminou com código ${code}`);
  }
}
console.log(`\n[queue] concluído. Fontes com erro: ${failed}/${queue.length}`);
