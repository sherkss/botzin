import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessInspector } from "./process-inspector.js";

const execFileAsync = promisify(execFile);

export class WindowsProcessInspector implements ProcessInspector {
  async isProcessRunning(processName: string): Promise<boolean | "unknown"> {
    let stdout = "";

    try {
      const result = await execFileAsync("tasklist", ["/FI", `IMAGENAME eq ${processName}`, "/FO", "CSV", "/NH"], {
        windowsHide: true
      });
      stdout = result.stdout;
    } catch {
      return "unknown";
    }

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some((line) => line.toLowerCase().startsWith(`"${processName.toLowerCase()}"`));
  }
}
