import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpResponse, http, mockServer } from "@watchdog/test-kit/http";

import { downloadToFile } from "../download";
import { API_KEY, API_URL, failureOf, standInApi } from "./stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const EXPORT_URL = `${API_URL}/cases/case-1/export.zip`;
standInApi();

/** Serve the export route; the key header it saw is the key header each request carried is returned in `keys`. */
function serveExport(
  respond: () => Response | ReturnType<typeof HttpResponse.json>
): { keys: (string | null)[] } {
  const keys: (string | null)[] = [];
  mockServer.use(
    http.get(EXPORT_URL, ({ request }) => {
      keys.push(request.headers.get("x-api-key"));
      return respond();
    })
  );
  return { keys };
}

function download(outPath?: string) {
  return downloadToFile({
    urlPath: "/cases/case-1/export.zip",
    ...(outPath === undefined ? {} : { outPath }),
    fallbackFilename: "fallback.zip",
  });
}

describe("downloadToFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "wd-download-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes the body to the requested path, authenticated with the key", async () => {
    const { keys } = serveExport(
      () =>
        new Response("payload", {
          headers: {
            "content-disposition": 'attachment; filename="case-export.zip"',
          },
        })
    );
    const target = path.join(dir, "out.zip");

    const written = await download(target);

    expect(written).toBe(target);
    expect(readFileSync(target, "utf-8")).toBe("payload");
    expect(keys).toEqual([API_KEY]);
  });

  it("names the file from content-disposition in the working directory when outPath is whitespace-only", async () => {
    serveExport(
      () =>
        new Response("payload", {
          headers: {
            "content-disposition": 'attachment; filename="case-export.zip"',
          },
        })
    );
    vi.spyOn(process, "cwd").mockReturnValue(dir);

    const written = await download("   ");

    expect(written).toBe(path.join(dir, "case-export.zip"));
    expect(readFileSync(written, "utf-8")).toBe("payload");
  });

  it("keeps a content-disposition filename inside the target directory", async () => {
    serveExport(
      () =>
        new Response("payload", {
          headers: {
            "content-disposition": 'attachment; filename="../../evil.zip"',
          },
        })
    );
    vi.spyOn(process, "cwd").mockReturnValue(dir);

    const written = await download();

    expect(path.dirname(written)).toBe(dir);
  });

  it("exits with the server-error code and writes nothing when the export route answers 5xx", async () => {
    serveExport(() => new Response("boom", { status: 502 }));

    const failure = await failureOf(() => download(path.join(dir, "out.zip")));

    expect(failure.error.code).toBe("DOWNLOAD_FAILED");
    expect(failure.error.status).toBe(502);
    expect(failure.exitCode).toBe(3);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("keeps the default exit code for a 4xx export response", async () => {
    serveExport(() => new Response("nope", { status: 404 }));

    const failure = await failureOf(() => download(path.join(dir, "out.zip")));

    expect(failure.error.code).toBe("DOWNLOAD_FAILED");
    expect(failure.exitCode).toBe(1);
    expect(existsSync(path.join(dir, "out.zip"))).toBe(false);
  });

  it("names the missing scope when the export route answers insufficient_scope", async () => {
    serveExport(() =>
      HttpResponse.json(
        {
          defined: true,
          code: "FORBIDDEN",
          status: 403,
          message: "This API key lacks the cases:read scope",
          data: { code: "insufficient_scope", requiredScope: "cases:read" },
        },
        { status: 403 }
      )
    );

    const failure = await failureOf(() => download());

    expect(failure.error.code).toBe("insufficient_scope");
    expect(failure.error.message).toContain("cases:read");
  });

  it("names the limit and the wait when the export Job start is refused with a 429", async () => {
    serveExport(() =>
      HttpResponse.json(
        {
          defined: true,
          code: "TOO_MANY_REQUESTS",
          status: 429,
          message: "Job start limit reached for this API key",
          data: {
            code: "job_start_limited",
            scope: "key",
            limit: 120,
            windowSeconds: 3600,
            retryAfterSeconds: 77,
          },
        },
        { status: 429, headers: { "Retry-After": "77" } }
      )
    );

    const failure = await failureOf(() => download());

    expect(failure.error.code).toBe("job_start_limited");
    expect(failure.error.status).toBe(429);
    expect(failure.error.retryAfterSeconds).toBe(77);
    expect(failure.error.message).toContain(
      "Job start limit reached for this API key"
    );
  });
});
