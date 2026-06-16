export interface ProcessInspector {
  isProcessRunning(processName: string): Promise<boolean | "unknown">;
}
