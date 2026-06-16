import type { RuntimeConfig } from "../config/runtime-config.js";
import type { ScreenFrame } from "../core/frame.js";
import type { FrameSource } from "./frame-source.js";
import OBSWebSocket from "obs-websocket-js";
import sharp from "sharp";
import { randomUUID } from "node:crypto";

export class ObsPreviewFrameSource implements FrameSource {
  readonly name = "obs-preview";
  private readonly obs = new OBSWebSocket();
  private connected = false;

  constructor(private readonly config: RuntimeConfig) {}

  async captureFrame(): Promise<ScreenFrame> {
    await this.connect();

    const screenshot = await this.obs.call("GetSourceScreenshot", {
      sourceName: this.config.obsSourceName,
      imageFormat: "png",
      imageCompressionQuality: -1
    });
    const data = parseImageData(String(screenshot.imageData));
    const metadata = await sharp(data).metadata();

    return {
      id: randomUUID(),
      sourceComputerId: this.config.nodeId,
      source: "obs-preview",
      capturedAt: new Date().toISOString(),
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      data,
      mimeType: "image/png"
    };
  }

  private async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    await this.obs.connect(this.config.obsWebSocketUrl, this.config.obsWebSocketPassword || undefined);
    this.connected = true;
  }
}

function parseImageData(imageData: string): Buffer {
  const base64 = imageData.includes(",") ? imageData.slice(imageData.indexOf(",") + 1) : imageData;
  return Buffer.from(base64, "base64");
}
