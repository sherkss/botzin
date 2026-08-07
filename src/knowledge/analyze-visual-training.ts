import { rm, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeVisualTrainingVideo, ensureLocalVisualModel, visualArtifactPath, type LocalVisualAnalyzerOptions } from "./local-visual-hunt-analyzer.js";
import { VisualTrainingDataset } from "./visual-training-dataset.js";

const defaultVisualRoot = resolve(fileURLToPath(new URL("../../storage/knowledge/visual-training", import.meta.url)));
const defaultKnowledgeRoot = dirname(defaultVisualRoot);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const valueAfter = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const visualTrainingRoot = resolve(valueAfter("--output") ?? process.env.BOTZIN_VISUAL_TRAINING_DIR ?? defaultVisualRoot);
  const options: LocalVisualAnalyzerOptions = {
    visualTrainingRoot,
    knowledgeRoot: resolve(valueAfter("--knowledge-output") ?? process.env.BOTZIN_KNOWLEDGE_DIR ?? defaultKnowledgeRoot),
    ollamaUrl: process.env.BOTZIN_OLLAMA_URL ?? "http://127.0.0.1:11434",
    model: valueAfter("--model") ?? process.env.BOTZIN_VISUAL_MODEL ?? "gemma3:4b",
    batchSize: positiveInteger(valueAfter("--batch-size") ?? process.env.BOTZIN_VISUAL_BATCH_SIZE, 1),
    concurrency: positiveInteger(valueAfter("--concurrency") ?? process.env.BOTZIN_VISUAL_CONCURRENCY, 1),
    retries: positiveInteger(valueAfter("--retries"), 2),
    requestTimeoutMs: positiveInteger(valueAfter("--timeout-ms") ?? process.env.BOTZIN_OLLAMA_REQUEST_TIMEOUT_MS, 1_200_000)
  };
  await ensureLocalVisualModel(options);
  const dataset = await VisualTrainingDataset.open(visualTrainingRoot);
  const videos = dataset.listVideos().filter((video) => video.analysisStatus !== "complete");
  if (videos.length === 0) {
    console.log("[visual-ai] Nenhum vídeo pendente.");
    return;
  }
  for (const video of videos) {
    try {
      const result = await analyzeVisualTrainingVideo(video, options);
      let updated = result.video;
      if (!args.includes("--keep-frames")) {
        await rm(visualArtifactPath(visualTrainingRoot, video.framesDirectory), { recursive: true, force: true });
        updated = { ...updated, framesDeletedAfterAnalysis: true };
      }
      if (!args.includes("--keep-video") && updated.videoPath) {
        await unlink(visualArtifactPath(visualTrainingRoot, updated.videoPath));
        updated = { ...updated, videoPath: null, sourceVideoDeleted: true };
      }
      await dataset.complete(updated);
      console.log(`[visual-ai] Relatório concluído: ${updated.analysisPath}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await dataset.fail({ videoId: video.videoId, title: video.title, sourceUrl: video.sourceUrl, reason });
      console.warn(`[visual-ai] Falha registrada: ${video.videoId} — ${reason}`);
    }
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Batch, concorrência e retries precisam ser inteiros maiores que zero.");
  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
