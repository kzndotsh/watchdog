#!/usr/bin/env node
/**
 * Production server for the TanStack Start build (`pnpm build` -> `dist/`): static assets from
 * `dist/client`, everything else through the SSR fetch handler in `dist/server/server.js`.
 * The container image runs this file; `vite dev` stays the dev server.
 *
 * PORT (default 3000) and HOST (default 0.0.0.0) pick the listen address. srvx drains in-flight
 * requests on SIGTERM and SIGINT.
 */
import path from "node:path";

import { serve } from "srvx";
import { serveStatic } from "srvx/static";

import server from "../dist/server/server.js";

/** An environment variable's value, with unset and empty both meaning "not given". */
function envOr(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

// The image bundles this file next to a copy of dist/client and points WD_CLIENT_DIR at it.
const clientDir = envOr(
  "WD_CLIENT_DIR",
  path.resolve(import.meta.dirname, "../dist/client")
);
const serveClient = serveStatic({ dir: clientDir });

/** Vite hashes every file under /assets/, so a browser may keep one for good. */
const IMMUTABLE = "public, max-age=31536000, immutable";

serve({
  port: envOr("PORT", "3000"),
  hostname: envOr("HOST", "0.0.0.0"),
  fetch: async (request) => server.fetch(request),
  middleware: [
    async (request, next) => {
      const response = await serveClient(request, next);
      if (
        response.status === 200 &&
        new URL(request.url).pathname.startsWith("/assets/")
      ) {
        response.headers.set("Cache-Control", IMMUTABLE);
      }
      return response;
    },
  ],
});
