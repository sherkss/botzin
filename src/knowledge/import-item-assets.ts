import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTibiaItemImageSources, type TibiaItemImageSource } from "../learning/tibia-game-catalog.js";
import { ItemAssetBatchJob } from "./item-asset-batch.js";

interface Options {
  readonly root: string;
  readonly limit: number;
  readonly delayMs: number;
  readonly concurrency: number;
  readonly categories: readonly string[];
  readonly skipExisting: boolean;
}

const defaultRoot = resolve(fileURLToPath(new URL("../../storage/knowledge/item-assets", import.meta.url)));

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  console.log(`[item-assets] Consultando o catálogo de itens da comunidade...`);
  const catalog = await fetchTibiaItemImageSources();
  const filtered = filterItems(catalog, options);
  const pending = options.skipExisting ? await withoutImported(filtered, options.root) : filtered;
  if (pending.length === 0) {
    console.log("[item-assets] Nenhum item novo para baixar.");
    return;
  }

  console.log(
    `[item-assets] ${catalog.length} itens no catálogo, ${pending.length} para baixar ` +
    `(concorrência ${options.concurrency}, intervalo ${options.delayMs}ms) em ${options.root}`
  );
  const job = new ItemAssetBatchJob(options.root);
  // --force must reach the importer: the queue-level skip alone still leaves the
  // manifest short-circuit in place and nothing would be re-downloaded.
  await job.start(pending, options.delayMs, options.concurrency, !options.skipExisting);

  let lastCompleted = -1;
  for (;;) {
    const status = await job.getStatus();
    if (!status) break;
    if (status.completed !== lastCompleted) {
      lastCompleted = status.completed;
      process.stdout.write(
        `\r[item-assets] ${status.completed}/${status.total} ` +
        `(novos ${status.imported}, cache ${status.cached}, falhas ${status.failed})   `
      );
    }
    if (status.status !== "running") {
      process.stdout.write("\n");
      if (status.fatalError) throw new Error(status.fatalError);
      console.log(`[item-assets] Concluído: ${status.imported} sprites baixados, ${status.failed} falhas.`);
      for (const failure of status.failures.slice(0, 10)) {
        console.log(`[item-assets] falha ${failure.sourceId} ${failure.name}: ${failure.reason}`);
      }
      if (status.failures.length > 10) console.log(`[item-assets] ...e mais ${status.failures.length - 10} falha(s).`);
      console.log(`[item-assets] Status completo em ${join(options.root, "batch-status.json")}`);
      break;
    }
    await wait(500);
  }
}

function filterItems(catalog: readonly TibiaItemImageSource[], options: Options): readonly TibiaItemImageSource[] {
  const selected = options.categories.length === 0
    ? catalog
    : catalog.filter((item) => item.categorySlug !== null && options.categories.includes(item.categorySlug));
  return options.limit > 0 ? selected.slice(0, options.limit) : selected;
}

/** The importer already short-circuits on a cached manifest; this only avoids queueing them. */
async function withoutImported(items: readonly TibiaItemImageSource[], root: string): Promise<readonly TibiaItemImageSource[]> {
  const existing = new Set(await readdir(root).catch(() => [] as string[]));
  return items.filter((item) => !existing.has(String(item.sourceId)));
}

function parseOptions(argv: readonly string[]): Options {
  let root = defaultRoot;
  let limit = 0;
  let delayMs = 120;
  let concurrency = 4;
  let categories: string[] = [];
  let skipExisting = true;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    const value = argv[index + 1];
    switch (flag) {
      case "--root": root = resolve(requireValue(flag, value)); index += 1; break;
      case "--limit": limit = requireInteger(flag, value, 0, 100_000); index += 1; break;
      case "--delay-ms": delayMs = requireInteger(flag, value, 0, 10_000); index += 1; break;
      case "--concurrency": concurrency = requireInteger(flag, value, 1, 8); index += 1; break;
      case "--categories":
        categories = requireValue(flag, value).split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
        index += 1;
        break;
      case "--force": skipExisting = false; break;
      default: throw new Error(`Opção desconhecida: ${flag}`);
    }
  }
  return { root, limit, delayMs, concurrency, categories, skipExisting };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) throw new Error(`A opção ${flag} exige um valor.`);
  return value;
}

function requireInteger(flag: string, value: string | undefined, min: number, max: number): number {
  const parsed = Number(requireValue(flag, value));
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`A opção ${flag} exige um inteiro entre ${min} e ${max}.`);
  }
  return parsed;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

await main();
