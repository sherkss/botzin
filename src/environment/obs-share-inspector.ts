import type { ShareInspector } from "./share-inspector.js";

export class ObsShareInspector implements ShareInspector {
  async isObsPreviewShared(_sourceName: string): Promise<boolean | "unknown"> {
    return "unknown";
  }

  async isTibiaShared(_sourceName: string): Promise<boolean | "unknown"> {
    return "unknown";
  }
}
