import path from "node:path";

import { describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  writeFile: vi.fn(async () => {}),
}));

vi.mock("node:fs/promises", () => fsMocks);

vi.mock("../client", () => ({
  getConfig: vi.fn(() => ({
    apiUrl: "http://127.0.0.1:3000",
    apiKey: "test-key",
  })),
}));

const failMock = vi.hoisted(() =>
  vi.fn((code: string, message: string, _opts?: { exitCode?: number }) => {
    throw new Error(`${code}: ${message}`);
  })
);

vi.mock("../io", () => ({
  fail: failMock,
  SERVER_ERROR_EXIT_CODE: 3,
}));

import { downloadToFile } from "../download";

describe("downloadToFile", () => {
  it("writes a successful download using the content-disposition filename", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("payload", {
          status: 200,
          headers: {
            "content-disposition": 'attachment; filename="case-export.zip"',
          },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const outPath = await downloadToFile({
      urlPath: "/cases/case-1/export.zip",
      outPath: "/tmp/case-export.zip",
      fallbackFilename: "fallback.zip",
    });

    expect(outPath).toBe("/tmp/case-export.zip");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/cases/case-1/export.zip",
      expect.objectContaining({
        headers: { "x-api-key": "test-key" },
      })
    );
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      "/tmp/case-export.zip",
      Buffer.from("payload")
    );
  });

  it("falls back to cwd filename when outPath is whitespace-only", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("payload", {
          status: 200,
          headers: {
            "content-disposition": 'attachment; filename="case-export.zip"',
          },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const outPath = await downloadToFile({
      urlPath: "/cases/case-1/export.zip",
      outPath: "   ",
      fallbackFilename: "fallback.zip",
    });

    expect(outPath).toBe(path.join(process.cwd(), "case-export.zip"));
  });
  it("exits with the server-error code when the export route answers 5xx", async () => {
    failMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502 }))
    );

    await expect(
      downloadToFile({
        urlPath: "/cases/case-1/export.zip",
        fallbackFilename: "case.zip",
      })
    ).rejects.toThrow("DOWNLOAD_FAILED");

    expect(failMock.mock.calls[0]?.[2]?.exitCode).toBe(3);
  });

  it("keeps the default exit code for a 4xx export response", async () => {
    failMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 }))
    );

    await expect(
      downloadToFile({
        urlPath: "/cases/case-1/export.zip",
        fallbackFilename: "case.zip",
      })
    ).rejects.toThrow("DOWNLOAD_FAILED");

    expect(failMock.mock.calls[0]?.[2]?.exitCode).toBeUndefined();
  });
});
