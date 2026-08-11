import { BatchImportJob, type BatchImportStatus } from "./batch-import-job.js";
import {
  importCreatureAnimation,
  type CreatureAnimationIdentity,
  type CreatureAnimationImportResult
} from "./creature-animation-importer.js";

export interface CreatureAnimationBatchFailure {
  readonly race: string;
  readonly name: string;
  readonly reason: string;
}

export type CreatureAnimationBatchStatus = BatchImportStatus<CreatureAnimationBatchFailure>;

type AnimationImporter = (options: {
  root: string;
  identity: CreatureAnimationIdentity;
}) => Promise<CreatureAnimationImportResult>;

export class CreatureAnimationBatchJob extends BatchImportJob<CreatureAnimationIdentity, CreatureAnimationBatchFailure> {
  constructor(root: string, importer: AnimationImporter = importCreatureAnimation) {
    super({
      root,
      jobLabel: "creature animation",
      emptyMessage: "The creature catalog is empty.",
      importer,
      describe: (identity) => identity.race,
      failureOf: (identity, reason) => ({ race: identity.race, name: identity.name, reason }),
      // The Fandom source rate limit is stricter than the item sprite API's.
      minDelayMs: 250,
      maxConcurrency: 1,
      maxRecordedFailures: null
    });
  }

  override start(creatures: readonly CreatureAnimationIdentity[], delayMs = 750): Promise<CreatureAnimationBatchStatus> {
    return super.start(creatures, delayMs, 1, false);
  }
}
