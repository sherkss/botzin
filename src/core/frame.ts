export interface ScreenFrame {
  readonly id: string;
  readonly sourceComputerId: string;
  readonly source: "obs-preview" | "file" | "mock";
  readonly capturedAt: string;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly mimeType: "image/png" | "image/jpeg" | "application/octet-stream";
}
