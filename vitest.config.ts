import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    // jsdom exposes localStorage only for documents with a real origin.
    // Without a url, `localStorage` is undefined in the test environment even
    // though `window` exists (vitest 4 + jsdom 29 behavior).
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    include: ["src/**/*.test.{ts,tsx}"],
    // Twelve logical cores on this machine — the default worker count leaves
    // some idle, and vitest is environment-bound (jsdom per file), so every
    // worker matters.
    maxWorkers: 12,
  },
});
