import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" path so lib modules can be tested as written.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
