import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["{app,components,lib}/**/*.test.{ts,tsx}"],
  },
});
