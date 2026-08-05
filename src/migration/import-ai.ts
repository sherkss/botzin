import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importAiMigration } from "./ai-migration.js";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const input = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
  if (!input) throw new Error("Informe o pacote com --input CAMINHO_DO_PACOTE.");
  const dryRun = args.includes("--dry-run");
  const result = await importAiMigration({ projectRoot, packageDirectory: resolve(input), dryRun });
  const megabytes = result.bytes / 1024 / 1024;
  console.log(`[migration] ${dryRun ? "Validação concluída" : "Importação concluída"}: ${result.files} arquivo(s), ${megabytes.toFixed(2)} MB.`);
  if (result.backupDirectory) console.log(`[migration] Backup dos arquivos substituídos: ${result.backupDirectory}`);
  if (result.manifest.databaseDumpIncluded) {
    console.log("[migration] O dump foi validado e copiado para storage/migration-import/database.sql; importe-o no MySQL separadamente.");
  }
  console.log("[migration] Revise storage/migration-import/configuration.env.example e crie seu .env sem reutilizar segredos desnecessariamente.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
