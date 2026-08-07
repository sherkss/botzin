import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";
import { ValidationError } from "../core/errors.js";

const FANDOM_API_URL = "https://tibia.fandom.com/api.php";
const MAX_ANIMATION_BYTES = 8 * 1024 * 1024;
const MAX_ANIMATION_FRAMES = 256;

export interface CreatureAnimationIdentity {
  readonly catalogId: number;
  readonly race: string;
  readonly name: string;
  readonly officialImageUrl: string | null;
}

export interface CreatureAnimationManifest {
  readonly version: 1;
  readonly catalogId: number;
  readonly race: string;
  readonly name: string;
  readonly source: "tibia-fandom";
  readonly sourceUrl: string;
  readonly descriptionUrl: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly frameDelayMs: readonly number[];
  readonly importedAt: string;
  readonly usage: "local-visual-training";
  readonly files: readonly string[];
}

export interface CreatureAnimationImportResult {
  readonly cached: boolean;
  readonly manifestPath: string;
  readonly manifest: CreatureAnimationManifest;
}

interface ImportOptions {
  readonly root: string;
  readonly identity: CreatureAnimationIdentity;
  readonly fileTitle?: string;
  readonly fetcher?: typeof fetch;
}

interface WikiImageInfo {
  readonly url?: string;
  readonly descriptionurl?: string;
  readonly mime?: string;
  readonly size?: number;
}

interface WikiPage {
  readonly title?: string;
  readonly missing?: boolean;
  readonly imageinfo?: readonly WikiImageInfo[];
}

export async function importCreatureAnimation(options: ImportOptions): Promise<CreatureAnimationImportResult> {
  const fetcher = options.fetcher ?? fetch;
  const race = safeRace(options.identity.race);
  const root = resolve(options.root);
  const targetDirectory = join(root, race);
  const manifestPath = join(targetDirectory, "manifest.json");
  const cached = await readManifest(manifestPath);
  if (cached) return { cached: true, manifestPath, manifest: cached };

  const image = await findAnimation(fetcher, options.identity, options.fileTitle);
  const source = await downloadAnimation(fetcher, image.url);
  const metadata = await sharp(source, { animated: true }).metadata();
  const frameCount = metadata.pages ?? 1;
  const pageHeight = metadata.pageHeight ?? metadata.height ?? 0;
  const width = metadata.width ?? 0;
  if (metadata.format !== "gif" || frameCount < 2) {
    throw new ValidationError(`A imagem encontrada para ${options.identity.name} não é uma animação com múltiplos quadros.`);
  }
  if (frameCount > MAX_ANIMATION_FRAMES || width < 1 || pageHeight < 1 || width > 512 || pageHeight > 512) {
    throw new ValidationError("A animação possui dimensões ou quantidade de quadros fora dos limites permitidos.");
  }

  await mkdir(root, { recursive: true });
  const temporaryDirectory = join(root, `.${race}-${randomUUID()}.tmp`);
  const framesDirectory = join(temporaryDirectory, "frames");
  await mkdir(framesDirectory, { recursive: true });
  try {
    await writeFile(join(temporaryDirectory, "source.gif"), source);
    const files: string[] = [];
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const filename = `${String(frameIndex + 1).padStart(3, "0")}.png`;
      await sharp(source, { animated: true, page: frameIndex, pages: 1 }).png().toFile(join(framesDirectory, filename));
      files.push(`frames/${filename}`);
    }

    const manifest: CreatureAnimationManifest = {
      version: 1,
      catalogId: options.identity.catalogId,
      race,
      name: options.identity.name,
      source: "tibia-fandom",
      sourceUrl: image.url,
      descriptionUrl: image.descriptionUrl,
      sha256: createHash("sha256").update(source).digest("hex"),
      width,
      height: pageHeight,
      frameCount,
      frameDelayMs: normalizedDelays(metadata.delay, frameCount),
      importedAt: new Date().toISOString(),
      usage: "local-visual-training",
      files
    };
    await writeFile(join(temporaryDirectory, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    await rename(temporaryDirectory, targetDirectory).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
    });
    const stored = await readManifest(manifestPath);
    if (!stored) throw new Error(`Não foi possível concluir a importação da animação de ${options.identity.name}.`);
    return { cached: false, manifestPath, manifest: stored };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function findAnimation(
  fetcher: typeof fetch,
  identity: CreatureAnimationIdentity,
  requestedTitle?: string
): Promise<{ url: string; descriptionUrl: string }> {
  const titles = requestedTitle ? [normalizeFileTitle(requestedTitle)] : animationTitleCandidates(identity);
  const url = new URL(FANDOM_API_URL);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    titles: titles.map((title) => `File:${title}`).join("|")
  }).toString();
  const response = await fetcher(url, { headers: { "User-Agent": "Botzin/0.1 local visual training" } });
  if (!response.ok) throw new Error(`TibiaWiki respondeu HTTP ${response.status} ao procurar a animação.`);
  const payload = await response.json() as { query?: { pages?: readonly WikiPage[] } };
  const page = (payload.query?.pages ?? []).find((candidate) => !candidate.missing && candidate.imageinfo?.[0]?.url);
  const info = page?.imageinfo?.[0];
  if (!info?.url) {
    throw new ValidationError(`Nenhuma animação foi encontrada para ${identity.name}. Informe fileTitle para selecionar o arquivo manualmente.`);
  }
  const sourceUrl = new URL(info.url);
  if (sourceUrl.protocol !== "https:" || sourceUrl.hostname !== "static.wikia.nocookie.net" || info.mime !== "image/gif") {
    throw new ValidationError("A fonte retornou um arquivo ou domínio não permitido.");
  }
  sourceUrl.searchParams.set("format", "original");
  return {
    url: sourceUrl.toString(),
    descriptionUrl: page?.title ? `https://tibia.fandom.com/wiki/${encodeURIComponent(page.title.replace(/^File:/, "File:"))}` : "https://tibia.fandom.com/"
  };
}

async function downloadAnimation(fetcher: typeof fetch, url: string): Promise<Buffer> {
  const response = await fetcher(url, { headers: { "User-Agent": "Botzin/0.1 local visual training" } });
  if (!response.ok) throw new Error(`A animação respondeu HTTP ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_ANIMATION_BYTES) throw new ValidationError("A animação excede o limite de 8 MB.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_ANIMATION_BYTES) throw new ValidationError("A animação excede o limite de 8 MB.");
  if (bytes.subarray(0, 6).toString("ascii") !== "GIF87a" && bytes.subarray(0, 6).toString("ascii") !== "GIF89a") {
    throw new ValidationError("O conteúdo baixado não possui uma assinatura GIF válida.");
  }
  return bytes;
}

function animationTitleCandidates(identity: CreatureAnimationIdentity): string[] {
  const officialFilename = identity.officialImageUrl ? decodeURIComponent(basename(new URL(identity.officialImageUrl).pathname)) : "";
  const names = [identity.name, singularName(identity.name), officialFilename.replace(/\.gif$/i, "")]
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set(names.map((name) => normalizeFileTitle(`${name}.gif`)))];
}

function singularName(value: string): string {
  return value.endsWith("s") && value.length > 1 ? value.slice(0, -1) : value;
}

function normalizeFileTitle(value: string): string {
  const title = value.trim().replace(/^File:/i, "");
  if (!title || title.length > 180 || /[|#<>[\]{}]/.test(title)) throw new ValidationError("fileTitle inválido.");
  return title.toLowerCase().endsWith(".gif") ? title : `${title}.gif`;
}

function safeRace(value: string): string {
  const race = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,139}$/.test(race)) throw new ValidationError("Identificador race inválido.");
  return race;
}

function normalizedDelays(value: number[] | undefined, frameCount: number): number[] {
  return Array.from({ length: frameCount }, (_, index) => Math.max(10, value?.[index] ?? value?.[0] ?? 100));
}

async function readManifest(path: string): Promise<CreatureAnimationManifest | null> {
  return readFile(path, "utf8").then((value) => JSON.parse(value) as CreatureAnimationManifest).catch(() => null);
}
