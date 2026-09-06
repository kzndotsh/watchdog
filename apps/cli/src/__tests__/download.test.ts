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

vi.mock("../io", () => ({
  fail: vi.fn((code: string, message: string) => {
    throw new Error(`${code}: ${message}`);
  }),
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
});
