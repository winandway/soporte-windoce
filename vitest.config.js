import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      include: ["src/**"],
      exclude: ["src/config.js", "src/estaticos.js"],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 70 },
    },
  },
});
