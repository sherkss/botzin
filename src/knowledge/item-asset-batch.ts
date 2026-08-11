import { BatchImportJob, type BatchImportStatus } from "./batch-import-job.js";
import { importItemAsset, type ItemAssetIdentity, type ItemAssetImportResult } from "./item-asset-importer.js";

export interface ItemAssetBatchFailure {
  readonly sourceId: number;
  readonly name: string;
  readonly reason: string;
}

export type ItemAssetBatchStatus = BatchImportStatus<ItemAssetBatchFailure>;

type ItemImporter = (options: {
  root: string;
  identity: ItemAssetIdentity;
  refresh?: boolean;
}) => Promise<ItemAssetImportResult>;

/** Failures are dominated by items without a usable sprite; keeping every reason would bloat the status file. */
const MAX_RECORDED_FAILURES = 200;

export class ItemAssetBatchJob extends BatchImportJob<ItemAssetIdentity, ItemAssetBatchFailure> {
  constructor(root: string, importer: ItemImporter = importItemAsset) {
    super({
      root,
      jobLabel: "item asset",
      emptyMessage: "The item catalog is empty.",
      importer,
      describe: (identity) => identity.name,
      failureOf: (identity, reason) => ({ sourceId: identity.sourceId, name: identity.name, reason }),
      minDelayMs: 0,
      maxConcurrency: 8,
      maxRecordedFailures: MAX_RECORDED_FAILURES
    });
  }

  override start(
    items: readonly ItemAssetIdentity[],
    delayMs = 150,
    concurrency = 4,
    refresh = false
  ): Promise<ItemAssetBatchStatus> {
    return super.start(items, delayMs, concurrency, refresh);
  }
}
