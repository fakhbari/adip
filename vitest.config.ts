import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests do not touch the UI, so disable CSS / PostCSS pipeline entirely
// (Tailwind 4's PostCSS plugin trips Vite's loader otherwise).
export default defineConfig({
  test: {
    include: [
      "__tests__/unit/**/*.test.ts",
      "mini-services/**/__tests__/**/*.test.ts",
    ],
    environment: "node",
    css: false,
  },
  css: {
    postcss: { plugins: [] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
