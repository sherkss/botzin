import "vitest";

declare module "vitest" {
  interface ProvidedContext {
    serverPort: number;
  }
}
