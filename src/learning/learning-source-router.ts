import type { BotLearningSource } from "../core/bot-configuration.js";

export type LearningProcessorKind =
  | "video-frame-extractor"
  | "image-annotator"
  | "text-parser"
  | "web-page-ingestor"
  | "market-normalizer"
  | "replay-loader"
  | "telemetry-aggregator"
  | "manual-note-parser";

export class LearningSourceRouter {
  processorsFor(source: BotLearningSource): readonly LearningProcessorKind[] {
    switch (source.sourceType) {
      case "video":
      case "obs-recording":
        return ["video-frame-extractor", "image-annotator"];
      case "image":
        return ["image-annotator"];
      case "text":
        return ["text-parser"];
      case "web-page":
        return ["web-page-ingestor", "text-parser"];
      case "market-snapshot":
        return ["market-normalizer"];
      case "replay":
        return ["replay-loader"];
      case "telemetry":
        return ["telemetry-aggregator"];
      case "manual-note":
        return ["manual-note-parser"];
    }
  }
}
