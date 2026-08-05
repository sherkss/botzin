import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportAiMigration, importAiMigration } from "../../src/migration/ai-migration.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("AI machine migration", () => {
  it("exports portable knowledge, excludes video artifacts and backs up import collisions", async () => {
    const source = await temporaryDirectory("botzin-export-source-");
    const destination = await temporaryDirectory("botzin-import-target-");
    const bundle = await temporaryDirectory("botzin-bundle-parent-");
    const packageDirectory = join(bundle, "package");
    await write(source, "package.json", JSON.stringify({ version: "0.1.0" }));
    await write(source, ".env.example", "BOTZIN_NODE_ID=pc-main\n");
    await write(source, "storage/knowledge/knowledge-index.json", "source-index");
    await write(source, "storage/knowledge/raw/video.mp4", "large-video");
    await write(source, "storage/knowledge/visual-training/frames/frame.jpg", "frame");
    await write(source, "models/tibia-entities.onnx", "model");
    await write(destination, "storage/knowledge/knowledge-index.json", "destination-index");

    const manifest = await exportAiMigration({
      projectRoot: source,
      outputDirectory: packageDirectory,
      includeTransient: false,
      gitCommit: "abc123"
    });
    expect(manifest.files.map((file) => file.targetPath)).toContain("storage/knowledge/knowledge-index.json");
    expect(manifest.files.map((file) => file.targetPath)).not.toContain("storage/knowledge/raw/video.mp4");
    expect(manifest.files.map((file) => file.targetPath)).not.toContain("storage/knowledge/visual-training/frames/frame.jpg");

    const result = await importAiMigration({ projectRoot: destination, packageDirectory, dryRun: false });
    expect(await readFile(join(destination, "storage/knowledge/knowledge-index.json"), "utf8")).toBe("source-index");
    expect(result.backups).toBe(1);
    expect(await readFile(join(result.backupDirectory!, "storage/knowledge/knowledge-index.json"), "utf8")).toBe("destination-index");
  });

  it("rejects a package whose contents changed after export", async () => {
    const source = await temporaryDirectory("botzin-tamper-source-");
    const destination = await temporaryDirectory("botzin-tamper-target-");
    const bundle = await temporaryDirectory("botzin-tamper-bundle-");
    const packageDirectory = join(bundle, "package");
    await write(source, "package.json", JSON.stringify({ version: "0.1.0" }));
    await write(source, "storage/knowledge/knowledge-index.json", "valid");
    const manifest = await exportAiMigration({ projectRoot: source, outputDirectory: packageDirectory, includeTransient: false });
    const index = manifest.files.find((file) => file.kind === "knowledge")!;
    await writeFile(join(packageDirectory, ...index.payloadPath.split("/")), "tampered", "utf8");

    await expect(importAiMigration({ projectRoot: destination, packageDirectory, dryRun: false }))
      .rejects.toThrow(/inválido/i);
  });

  it("rejects a package that tries to overwrite project code", async () => {
    const source = await temporaryDirectory("botzin-path-source-");
    const destination = await temporaryDirectory("botzin-path-target-");
    const bundle = await temporaryDirectory("botzin-path-bundle-");
    const packageDirectory = join(bundle, "package");
    await write(source, "package.json", JSON.stringify({ version: "0.1.0" }));
    await write(source, "storage/knowledge/knowledge-index.json", "valid");
    const manifest = await exportAiMigration({ projectRoot: source, outputDirectory: packageDirectory, includeTransient: false });
    const malicious = {
      ...manifest,
      files: manifest.files.map((file, index) => index === 0 ? { ...file, targetPath: "package.json" } : file)
    };
    await writeFile(join(packageDirectory, "migration-manifest.json"), JSON.stringify(malicious), "utf8");

    await expect(importAiMigration({ projectRoot: destination, packageDirectory, dryRun: false }))
      .rejects.toThrow(/destino não permitido/i);
  });
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  directories.push(path);
  return path;
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const path = join(root, ...relativePath.split("/"));
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}
