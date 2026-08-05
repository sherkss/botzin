import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface ExistingVideoSource {
  readonly id: string;
  readonly title: string;
  readonly webpage_url: string;
}

interface StoredVideoInfo {
  readonly id?: string;
  readonly title?: string;
  readonly webpage_url?: string;
  readonly original_url?: string;
}

export async function loadExistingVideoSources(rawDirectory: string): Promise<ExistingVideoSource[]> {
  const paths = (await listInfoFiles(rawDirectory)).sort();
  const sources = new Map<string, ExistingVideoSource>();
  for (const path of paths) {
    try {
      const info = JSON.parse(await readFile(path, "utf8")) as StoredVideoInfo;
      if (!info.id || sources.has(info.id)) continue;
      sources.set(info.id, {
        id: info.id,
        title: info.title?.trim() || info.id,
        webpage_url: info.webpage_url ?? info.original_url ?? `https://www.youtube.com/watch?v=${info.id}`
      });
    } catch {
      console.warn(`[visual] Metadado inválido ignorado: ${path}`);
    }
  }
  return [...sources.values()];
}

async function listInfoFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const paths: string[] = [];
    for (const entry of entries) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) paths.push(...await listInfoFiles(path));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".info.json")) paths.push(path);
    }
    return paths;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
