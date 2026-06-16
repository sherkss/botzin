import type { RuntimeConfig } from "../config/runtime-config.js";
import type { CheckStatus, RuntimeEnvironmentStatus } from "./check-status.js";
import type { ProcessInspector } from "./process-inspector.js";
import type { ShareInspector } from "./share-inspector.js";

export class RuntimeEnvironmentChecker {
  constructor(
    private readonly config: RuntimeConfig,
    private readonly processInspector: ProcessInspector,
    private readonly shareInspector: ShareInspector
  ) {}

  async check(): Promise<RuntimeEnvironmentStatus> {
    const [obsOpen, tibiaOpen, obsShared, tibiaShared] = await Promise.all([
      this.checkProcess(this.config.obsProcessName, "OBS Studio"),
      this.checkProcess(this.config.tibiaProcessName, "Tibia"),
      this.checkShare(this.shareInspector.isObsPreviewShared(this.config.obsSourceName), this.config.obsSourceName, "OBS preview"),
      this.checkShare(this.shareInspector.isTibiaShared(this.config.tibiaSourceName), this.config.tibiaSourceName, "Tibia source")
    ]);

    return {
      checkedAt: new Date().toISOString(),
      computerId: this.config.nodeId,
      obsOpen,
      tibiaOpen,
      obsShared,
      tibiaShared
    };
  }

  private async checkProcess(processName: string, label: string): Promise<CheckStatus> {
    const running = await this.processInspector.isProcessRunning(processName);

    if (running === "unknown") {
      return {
        state: "unknown",
        detail: `${label} process "${processName}" could not be confirmed by the process inspector.`
      };
    }

    return running
      ? { state: "ok", detail: `${label} process "${processName}" is running.` }
      : { state: "missing", detail: `${label} process "${processName}" was not found.` };
  }

  private async checkShare(
    probe: Promise<boolean | "unknown">,
    sourceName: string,
    label: string
  ): Promise<CheckStatus> {
    const shared = await probe;

    if (shared === "unknown") {
      return {
        state: "unknown",
        detail: `${label} "${sourceName}" could not be confirmed until an OBS sharing adapter is connected.`
      };
    }

    return shared
      ? { state: "ok", detail: `${label} "${sourceName}" is available.` }
      : { state: "missing", detail: `${label} "${sourceName}" was not found.` };
  }
}
