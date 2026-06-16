export interface ShareInspector {
  isObsPreviewShared(sourceName: string): Promise<boolean | "unknown">;
  isTibiaShared(sourceName: string): Promise<boolean | "unknown">;
}
