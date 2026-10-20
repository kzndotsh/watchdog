import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { precompressDir } from "../../build/precompress.ts";
import {
  createStaticAssetsMiddleware,
  IMMUTABLE_CACHE_CONTROL,
} from "../static-assets.server.ts";

const SCRIPT =
  "export const answer = 42; // padding that compresses well\n".repeat(200);
const FALLTHROUGH = "ssr handler";

let dir = "";
let serve: ReturnType<typeof createStaticAssetsMiddleware>;

async function get(
  pathname: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  return serve(
    new Request(`http://app.test${pathname}`, { headers }),
    async () => new Response(FALLTHROUGH, { status: 404 })
  );
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wd-static-"));
  await mkdir(path.join(dir, "assets"));
  await writeFile(path.join(dir, "assets", "app-1a2b.js"), SCRIPT);
  await writeFile(path.join(dir, "robots.txt"), "tiny");
  await writeFile(path.join(dir, ".env"), "SECRET=1");
  await precompressDir(dir);
  serve = createStaticAssetsMiddleware(dir);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("precompressed static assets", () => {
  it("serves brotli when accepted, with Content-Encoding and Vary", async () => {
    const response = await get("/assets/app-1a2b.js", {
      "accept-encoding": "gzip, br",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("vary")).toContain("Accept-Encoding");
    expect(response.headers.get("content-type")).toContain("javascript");
    const body = brotliDecompressSync(
      Buffer.from(await response.arrayBuffer())
    );
    expect(body.toString()).toBe(SCRIPT);
  });

  it("serves gzip to a client that does not accept brotli", async () => {
    const response = await get("/assets/app-1a2b.js", {
      "accept-encoding": "gzip",
    });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    const body = gunzipSync(Buffer.from(await response.arrayBuffer()));
    expect(body.toString()).toBe(SCRIPT);
  });

  it("serves the plain file when no encoding is accepted", async () => {
    const response = await get("/assets/app-1a2b.js");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("vary")).toContain("Accept-Encoding");
    expect(await response.text()).toBe(SCRIPT);
  });

  it("keeps the immutable rule on /assets/ and adds none elsewhere", async () => {
    const asset = await get("/assets/app-1a2b.js", { "accept-encoding": "br" });
    expect(asset.headers.get("cache-control")).toBe(IMMUTABLE_CACHE_CONTROL);
    const robots = await get("/robots.txt");
    expect(robots.status).toBe(200);
    expect(robots.headers.get("cache-control")).toBeNull();
    // Close the file streams: an unread body leaves its file handle to the garbage collector.
    await Promise.all([asset.body?.cancel(), robots.body?.cancel()]);
  });

  it("refuses dotfiles and path traversal, handing them to the app", async () => {
    const bodies = await Promise.all(
      ["/.env", "/assets/../.env", "/%2e%2e/etc/passwd"].map(async (bad) => {
        const response = await get(bad);
        return response.text();
      })
    );
    expect(bodies).toEqual([FALLTHROUGH, FALLTHROUGH, FALLTHROUGH]);
  });

  it("writes no sibling for a file under 1 KiB", async () => {
    const response = await get("/robots.txt", { "accept-encoding": "br" });
    expect(response.headers.get("content-encoding")).toBeNull();
    await response.body?.cancel();
  });
});
