import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "api",
          environment: "node",
          include: ["tests/api/**/*.test.ts"],
          globalSetup: "tests/global-setup.ts",
          setupFiles: ["tests/test-setup.ts"],
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
      {
        test: {
          name: "frontend",
          environment: "happy-dom",
          include: ["tests/frontend/**/*.test.js"],
        },
      },
    ],
  },
});
