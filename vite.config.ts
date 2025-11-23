import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [react(), dts()],
  build: {
    lib: {
      entry: "src/index.tsx",
      name: "nitro-query",
      formats: ["es", "umd", "cjs"],
      fileName: (format) => `nitro-query.${format}.js`,
    },
    rollupOptions: {
      // Externalize dependencies that shouldn't be bundled
      external: ["react"],
      output: {
        globals: {
            react: "React"
        },
        exports: "auto"
      },
    },
  },
});