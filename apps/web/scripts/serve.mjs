#!/usr/bin/env node
/**
 * Production server for the TanStack Start build (`pnpm build` -> `dist/`): static assets from
 * `dist/client`, everything else through the SSR fetch handler in `dist/server/server.js`.
 * The container image runs this file; `vite dev` stays the dev server.
 *
 * Request bodies are capped at BODY_LIMIT_BYTES (REQUEST_BODY_MAX_BYTES, exported by the server entry).
 * PORT (default 3000) and HOST (default 0.0.0.0) pick the listen address. srvx drains in-flight
 * requests on SIGTERM and SIGINT.
 */
import path from "node:path";

import { serve } from "srvx";
import { staticMiddleware } from "srvx/static";

import server, { BODY_LIMIT_BYTES } from "../dist/server/server.js";

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
const serveClient = staticMiddleware({ dir: clientDir });

/** Vite hashes every file under /assets/, so a browser may keep one for good. */
const IMMUTABLE = "public, max-age=31536000, immutable";

serve({
  port: envOr("PORT", "3000"),
  hostname: envOr("HOST", "0.0.0.0"),
  // Second line of defence: the server entry (src/server.ts) already answers an oversized body
  // 413 with the security headers; this stops a body stream that outruns it.
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- build output, see below
  maxRequestBodySize: BODY_LIMIT_BYTES,
  // oxlint-disable-next-line typescript/no-unsafe-call -- dist/server/server.js is a build output: lint (CI) runs before any build, so its type is unresolved
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
