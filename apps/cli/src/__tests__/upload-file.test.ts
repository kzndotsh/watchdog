import { describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  presign: vi.fn().mockResolvedValue({
    url: "http://127.0.0.1:9100/evidence/object",
    uri: "s3://watchdog-evidence/object",
    sha256: "a".repeat(64),
    mime: "text/plain",
    byteLength: 5,
    headers: { "Content-Type": "text/plain" },
  }),
  confirmFile: vi.fn().mockResolvedValue({ id: "evidence-1" }),
}));

vi.mock("../client", () => ({
  api: () => ({
    evidence: {
      presign: apiMocks.presign,
      confirmFile: apiMocks.confirmFile,
    },
  }),
}));

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(async () => ({
    isFile: () => true,
    size: 5,
  })),
  readFile: vi.fn(async () => Buffer.from("hello")),
}));

import { uploadEvidenceFile } from "../upload-file";

describe("uploadEvidenceFile", () => {
  it("presigns, uploads, and confirms an evidence file", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const row = await uploadEvidenceFile({
      caseId: "case-1",
      path: "/tmp/note.txt",
      label: "Note",
    });

    expect(apiMocks.presign).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
    expect(apiMocks.confirmFile).toHaveBeenCalled();
    expect(row).toEqual({ id: "evidence-1" });
  });
});
