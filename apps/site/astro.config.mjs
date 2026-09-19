import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const root = import.meta.dirname;

export default defineConfig({
  site: "https://watchdog.com",
  output: "static",
  server: {
    port: 3001,
  },
  vite: {
    envDir: "../../",
    resolve: {
      alias: {
        "@": path.join(root, "src"),
      },
      tsconfigPaths: true,
    },
    plugins: [tailwindcss()],
  },
});
