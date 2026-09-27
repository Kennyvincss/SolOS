import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "test/stubs/server-only.ts") } },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
