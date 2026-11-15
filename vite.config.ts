import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy leaf vendor libs out of the app chunk. Everything else
        // routes lazily at the page level (see App.tsx).
        manualChunks(id: string) {
          if (/node_modules[\\/](react|react-dom|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (/node_modules[\\/]jspdf[\\/]/.test(id) || /node_modules[\\/]html2canvas[\\/]/.test(id) || /node_modules[\\/]xlsx[\\/]/.test(id)) {
            return "vendor-docs";
          }
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime"],
  },
});
