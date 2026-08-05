import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type MigrationFileKind = "knowledge" | "model" | "configuration-template" | "database-dump";

export interface MigrationFile {
  readonly kind: MigrationFileKind;
  readonly payloadPath: string;
  readonly targetPath: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface MigrationManifest {
  readonly version: 1;
  readonly createdAt: string;
  readonly appVersion: string;
  readonly gitCommit: string | null;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly transientFilesIncluded: boolean;
  readonly databaseDumpIncluded: boolean;
  readonly files: readonly MigrationFile[];
}

export interface ExportMigrationOptions {
  readonly projectRoot: string;
  readonly outputDirectory: string;
  readonly includeTransient: boolean;
  readonly databaseDumpPath?: string | null;
  readonly gitCommit?: string | null;
}

export interface ImportMigrationOptions {
  readonly projectRoot: string;
  readonly packageDirectory: string;
  readonly dryRun: boolean;
  readonly backupDirectory?: string;
}

export interface ImportMigrationResult {
  readonly files: number;
  readonly bytes: number;
  readonly backups: number;
  readonly backupDirectory: string | null;
  readonly manifest: MigrationManifest;
}

const MANIFEST_FILENAME = "migration-manifest.json";
const transientKnowledgePrefixes = [
  "storage/knowledge/raw/",
  "storage/knowledge/audio/",
  "storage/knowledge/whisper/",
  "storage/knowledge/visual-training/videos/",
  "storage/knowledge/visual-training/frames/"
] as const;

export async function exportAiMigration(options: ExportMigrationOptions): Promise<MigrationManifest> {
  const projectRoot = resolve(options.projectRoot);
  const outputDirectory = resolve(options.outputDirectory);
  await ensureEmptyDirectory(outputDirectory);
  const sources: Array<{ sourcePath: string; targetPath: string; kind: MigrationFileKind }> = [];

  for (const sourcePath of await listFiles(join(projectRoot, "storage", "knowledge"))) {
    const targetPath = portable(relative(projectRoot, sourcePath));
    if (!options.includeTransient && transientKnowledgePrefixes.some((prefix) => targetPath.startsWith(prefix))) continue;
    sources.push({ sourcePath, targetPath, kind: "knowledge" });
  }
  for (const sourcePath of await listFiles(join(projectRoot, "models"))) {
    sources.push({ sourcePath, targetPath: portable(relative(projectRoot, sourcePath)), kind: "model" });
  }

  const configurationTemplate = join(projectRoot, ".env.example");
  if (await isFile(configurationTemplate)) {
    sources.push({
      sourcePath: configurationTemplate,
      targetPath: "storage/migration-import/configuration.env.example",
      kind: "configuration-template"
    });
  }
  if (options.databaseDumpPath) {
    const databaseDumpPath = resolve(options.databaseDumpPath);
    if (!await isFile(databaseDumpPath)) throw new Error(`Dump do banco não encontrado: ${databaseDumpPath}`);
    sources.push({
      sourcePath: databaseDumpPath,
      targetPath: "storage/migration-import/database.sql",
      kind: "database-dump"
    });
  }

  const files: MigrationFile[] = [];
  for (const source of sources.sort((left, right) => left.targetPath.localeCompare(right.targetPath))) {
    const payloadPath = portable(join("payload", source.targetPath));
    const destination = safeChild(outputDirectory, payloadPath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source.sourcePath, destination);
    const metadata = await stat(destination);
    files.push({
      kind: source.kind,
      payloadPath,
      targetPath: source.targetPath,
      bytes: metadata.size,
      sha256: await sha256(destination)
    });
  }

  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as { version?: string };
  const manifest: MigrationManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: packageJson.version ?? "unknown",
    gitCommit: options.gitCommit ?? null,
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    transientFilesIncluded: options.includeTransient,
    databaseDumpIncluded: files.some((file) => file.kind === "database-dump"),
    files
  };
  await writeFile(join(outputDirectory, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export async function importAiMigration(options: ImportMigrationOptions): Promise<ImportMigrationResult> {
  const projectRoot = resolve(options.projectRoot);
  const packageDirectory = resolve(options.packageDirectory);
  const manifest = await readManifest(packageDirectory);
  await validateMigrationPackage(packageDirectory, manifest);
  const backupDirectory = resolve(options.backupDirectory ?? join(
    projectRoot,
    "storage",
    "migration-backups",
    new Date().toISOString().replace(/[:.]/g, "-")
  ));
  let backups = 0;

  if (!options.dryRun) {
    for (const file of manifest.files) {
      const source = safeChild(packageDirectory, file.payloadPath);
      const target = safeChild(projectRoot, file.targetPath);
      if (await isFile(target)) {
        const backup = safeChild(backupDirectory, file.targetPath);
        await mkdir(dirname(backup), { recursive: true });
        await copyFile(target, backup);
        backups += 1;
      }
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    }
    await mkdir(join(projectRoot, "storage", "migration-import"), { recursive: true });
    await writeFile(join(projectRoot, "storage", "migration-import", "last-import.json"), JSON.stringify({
      importedAt: new Date().toISOString(),
      sourceManifest: manifest,
      backupDirectory: backups > 0 ? backupDirectory : null
    }, null, 2), "utf8");
  }

  return {
    files: manifest.files.length,
    bytes: manifest.files.reduce((total, file) => total + file.bytes, 0),
    backups,
    backupDirectory: !options.dryRun && backups > 0 ? backupDirectory : null,
    manifest
  };
}

export async function readManifest(packageDirectory: string): Promise<MigrationManifest> {
  const parsed = JSON.parse(await readFile(join(resolve(packageDirectory), MANIFEST_FILENAME), "utf8")) as MigrationManifest;
  if (parsed.version !== 1 || !Array.isArray(parsed.files)) throw new Error("Manifesto de migração inválido ou incompatível.");
  const targets = new Set<string>();
  for (const file of parsed.files) {
    if (!isMigrationFile(file)) throw new Error("Manifesto de migração contém uma entrada de arquivo inválida.");
    if (!isAllowedTarget(file.targetPath)) throw new Error(`Destino não permitido no pacote: ${file.targetPath}`);
    if (targets.has(file.targetPath)) throw new Error(`Destino duplicado no pacote: ${file.targetPath}`);
    targets.add(file.targetPath);
  }
  return parsed;
}

export async function validateMigrationPackage(packageDirectory: string, manifest: MigrationManifest): Promise<void> {
  const root = resolve(packageDirectory);
  for (const file of manifest.files) {
    const path = safeChild(root, file.payloadPath);
    const metadata = await stat(path).catch(() => null);
    if (!metadata?.isFile()) throw new Error(`Arquivo ausente no pacote: ${file.payloadPath}`);
    if (metadata.size !== file.bytes) throw new Error(`Tamanho inválido no pacote: ${file.payloadPath}`);
    if (await sha256(path) !== file.sha256) throw new Error(`Checksum SHA-256 inválido: ${file.payloadPath}`);
    safeChild(resolve("."), file.targetPath);
  }
}

async function ensureEmptyDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  if ((await readdir(path)).length > 0) throw new Error(`A pasta de saída precisa estar vazia: ${path}`);
}

async function listFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) files.push(...await listFiles(path));
      else if (entry.isFile()) files.push(path);
    }
    return files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function safeChild(root: string, child: string): string {
  if (isAbsolute(child)) throw new Error(`Caminho absoluto não permitido no pacote: ${child}`);
  const target = resolve(root, child);
  const relativeTarget = relative(resolve(root), target);
  if (relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
    throw new Error(`Caminho fora da raiz não permitido: ${child}`);
  }
  return target;
}

function portable(path: string): string {
  return path.replaceAll("\\", "/");
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then((value) => value.isFile()).catch(() => false);
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function isMigrationFile(value: unknown): value is MigrationFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<MigrationFile>;
  return (file.kind === "knowledge" || file.kind === "model" || file.kind === "configuration-template" || file.kind === "database-dump")
    && typeof file.payloadPath === "string" && file.payloadPath.startsWith("payload/") && isPortableRelativePath(file.payloadPath)
    && typeof file.targetPath === "string" && file.targetPath.length > 0 && isPortableRelativePath(file.targetPath)
    && Number.isSafeInteger(file.bytes) && (file.bytes ?? -1) >= 0
    && typeof file.sha256 === "string" && /^[a-f0-9]{64}$/.test(file.sha256);
}

function isAllowedTarget(path: string): boolean {
  return path.startsWith("storage/knowledge/")
    || path.startsWith("models/")
    || path === "storage/migration-import/configuration.env.example"
    || path === "storage/migration-import/database.sql";
}

function isPortableRelativePath(path: string): boolean {
  return !path.includes("\\")
    && !path.startsWith("/")
    && path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
