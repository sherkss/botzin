import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { exportAiMigration } from "./ai-migration.js";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const valueAfter = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const output = resolve(valueAfter("--output") ?? defaultOutput());
  const manifest = await exportAiMigration({
    projectRoot,
    outputDirectory: output,
    includeTransient: args.includes("--include-transient"),
    databaseDumpPath: valueAfter("--database-dump"),
    gitCommit: await gitCommit()
  });
  const megabytes = manifest.files.reduce((total, file) => total + file.bytes, 0) / 1024 / 1024;
  console.log(`[migration] Pacote criado: ${output}`);
  console.log(`[migration] ${manifest.files.length} arquivo(s), ${megabytes.toFixed(2)} MB, commit ${manifest.gitCommit ?? "desconhecido"}.`);
  console.log("[migration] Segredos do .env não foram incluídos.");
}

function defaultOutput(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(projectRoot, "storage", "migrations", `botzin-ai-${timestamp}`);
}

async function gitCommit(): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const child = spawn("git", ["rev-parse", "HEAD"], { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => resolvePromise(null));
    child.on("exit", (code) => resolvePromise(code === 0 ? Buffer.concat(chunks).toString("utf8").trim() : null));
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
