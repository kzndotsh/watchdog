/**
 * Static files for the production server (`scripts/serve.mjs`): `dist/client` through srvx's
 * `staticMiddleware`. The build writes brotli and gzip siblings (`src/build/precompress.ts`) and
 * `encodings` serves them with `Content-Encoding` and `Vary: Accept-Encoding` when the client
 * accepts one; a file with no sibling is plain (or compressed on the fly when it is large enough).
 * Dotfiles and paths outside the directory are refused by srvx.
 */
import type { ServerMiddleware } from "srvx";
import { staticMiddleware } from "srvx/static";

/** Vite hashes every file under /assets/, so a browser may keep one for good. */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function createStaticAssetsMiddleware(dir: string): ServerMiddleware {
  const serveClient = staticMiddleware({
    dir,
    // Brotli first: srvx tries the keys in order against the client's Accept-Encoding.
    encodings: { br: ".br", gzip: ".gz" },
  });
  return async (request, next) => {
    const response = await serveClient(request, next);
    if (
      response.status === 200 &&
      new URL(request.url).pathname.startsWith("/assets/")
    ) {
      response.headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    }
    return response;
  };
}
