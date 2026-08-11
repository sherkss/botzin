import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { ValidationError } from "../core/errors.js";

const ITEM_API_URL = "https://tibiadata.bytewizards.de/api/v1/items";
const ASSET_API_URL = "https://tibiadata.bytewizards.de/api/v1/assets";
const ALLOWED_HOST = "tibiadata.bytewizards.de";
const MAX_SPRITE_BYTES = 4 * 1024 * 1024;
const MAX_SPRITE_EDGE = 512;
const USER_AGENT = "Botzin/0.1 local visual training";

export interface ItemAssetIdentity {
  readonly sourceId: number;
  readonly name: string;
  /** Resolved from the item detail endpoint when omitted. */
  readonly assetId?: number | null;
  readonly categorySlug?: string | null;
}

export interface ItemAssetManifest {
  readonly version: 1;
  readonly sourceId: number;
  readonly name: string;
  readonly categorySlug: string | null;
  readonly source: "tibiadata-community";
  readonly assetId: number;
  readonly sourceUrl: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly importedAt: string;
  readonly usage: "local-visual-training";
  readonly files: readonly string[];
}

export interface ItemAssetImportResult {
  readonly cached: boolean;
  readonly manifestPath: string;
  readonly manifest: ItemAssetManifest;
}

interface ImportOptions {
  readonly root: string;
  readonly identity: ItemAssetIdentity;
  /** Re-download and replace the asset even when a manifest already exists. */
  readonly refresh?: boolean;
  readonly fetcher?: typeof fetch;
}

interface ItemImageInfo {
  readonly assetId?: unknown;
  readonly mimeType?: unknown;
}

interface ItemDetailResponse {
  readonly images?: unknown;
  readonly primaryImage?: unknown;
}

export async function importItemAsset(options: ImportOptions): Promise<ItemAssetImportResult> {
  const fetcher = options.fetcher ?? fetch;
  const sourceId = safeSourceId(options.identity.sourceId);
  const root = resolve(options.root);
  const targetDirectory = join(root, String(sourceId));
  const manifestPath = join(targetDirectory, "manifest.json");
  const cached = await readManifest(manifestPath);
  if (cached && !options.refresh) return { cached: true, manifestPath, manifest: cached };

  const assetId = options.identity.assetId ?? await resolveAssetId(fetcher, sourceId, options.identity.name);
  const sourceUrl = `${ASSET_API_URL}/${safeSourceId(assetId)}`;
  const source = await downloadSprite(fetcher, sourceUrl, options.identity.name);
  const image = sharp(source);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 1 || height < 1 || width > MAX_SPRITE_EDGE || height > MAX_SPRITE_EDGE) {
    throw new ValidationError(`O sprite de ${options.identity.name} possui dimensões fora dos limites permitidos.`);
  }
  const png = await sharp(source).ensureAlpha().png().toBuffer();
  // A fully transparent sprite teaches the detector nothing and would break the
  // synthetic dataset builder, which requires a visible bounding box.
  if (await isFullyTransparent(png)) {
    throw new ValidationError(`O sprite de ${options.identity.name} não possui pixels visíveis.`);
  }

  await mkdir(root, { recursive: true });
  const temporaryDirectory = join(root, `.${sourceId}-${randomUUID()}.tmp`);
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    await writeFile(join(temporaryDirectory, "source.webp"), source);
    await writeFile(join(temporaryDirectory, "sprite.png"), png);
    const manifest: ItemAssetManifest = {
      version: 1,
      sourceId,
      name: options.identity.name,
      categorySlug: options.identity.categorySlug ?? null,
      source: "tibiadata-community",
      assetId: safeSourceId(assetId),
      sourceUrl,
      sha256: createHash("sha256").update(source).digest("hex"),
      width,
      height,
      importedAt: new Date().toISOString(),
      usage: "local-visual-training",
      files: ["sprite.png"]
    };
    await writeFile(join(temporaryDirectory, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    // On refresh the target already exists and publishDirectory treats EEXIST as
    // success, which would silently keep the old files.
    if (cached) await rm(targetDirectory, { recursive: true, force: true });
    await publishDirectory(temporaryDirectory, targetDirectory);
    const stored = await readManifest(manifestPath);
    if (!stored) throw new Error(`Não foi possível concluir a importação do sprite de ${options.identity.name}.`);
    return { cached: false, manifestPath, manifest: stored };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/**
 * Windows fails the rename with EPERM/EBUSY while an indexer or antivirus still holds a
 * handle on the freshly written files, which is common when thousands of sprites are
 * imported in parallel. Retrying briefly turns those transient errors into successes.
 */
async function publishDirectory(temporaryDirectory: string, targetDirectory: string): Promise<void> {
  const transient = new Set(["EPERM", "EBUSY", "EACCES"]);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(temporaryDirectory, targetDirectory);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (code === "EEXIST" || code === "ENOTEMPTY") return;
      if (!transient.has(code) || attempt >= 5) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 120));
    }
  }
}

async function resolveAssetId(fetcher: typeof fetch, sourceId: number, name: string): Promise<number> {
  const response = await fetcher(`${ITEM_API_URL}/${sourceId}`, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`O catálogo de itens respondeu HTTP ${response.status} para ${name}.`);
  const payload = await response.json() as ItemDetailResponse;
  const images = Array.isArray(payload.images) ? payload.images as ItemImageInfo[] : [];
  const candidates = payload.primaryImage ? [payload.primaryImage as ItemImageInfo, ...images] : images;
  const assetId = candidates.map((image) => Number(image?.assetId)).find((value) => Number.isSafeInteger(value) && value > 0);
  if (!assetId) throw new ValidationError(`Nenhuma imagem foi encontrada para o item ${name}.`);
  return assetId;
}

async function downloadSprite(fetcher: typeof fetch, url: string, name: string): Promise<Buffer> {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.hostname !== ALLOWED_HOST) {
    throw new ValidationError("A fonte retornou um domínio não permitido.");
  }
  const response = await fetcher(target, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`O sprite de ${name} respondeu HTTP ${response.status}.`);
  const mime = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (mime !== "image/webp") throw new ValidationError(`O sprite de ${name} não é um arquivo WebP.`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_SPRITE_BYTES) {
    throw new ValidationError("O sprite excede o limite de 4 MB.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_SPRITE_BYTES) throw new ValidationError("O sprite excede o limite de 4 MB.");
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") {
    throw new ValidationError("O conteúdo baixado não possui uma assinatura WebP válida.");
  }
  return bytes;
}

async function isFullyTransparent(png: Buffer): Promise<boolean> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 4) return false;
  for (let offset = 3; offset < data.length; offset += info.channels) {
    if (data[offset]! > 0) return false;
  }
  return true;
}

function safeSourceId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ValidationError("Identificador de item inválido.");
  return value;
}

async function readManifest(path: string): Promise<ItemAssetManifest | null> {
  return readFile(path, "utf8").then((value) => JSON.parse(value) as ItemAssetManifest).catch(() => null);
}
