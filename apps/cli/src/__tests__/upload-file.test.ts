import { beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(0);

const apiMocks = vi.hoisted(() => {
  const caseId = "11111111-1111-4111-8111-000000000000";
  const sha256 = "a".repeat(64);
  return {
    presign: vi.fn().mockResolvedValue({
      url: "http://127.0.0.1:9100/evidence/object",
      uri: `${caseId}/${sha256}`,
      sha256,
      mime: "text/plain",
      byteLength: 5,
      headers: { "Content-Type": "text/plain" },
    }),
    confirmFile: vi.fn().mockResolvedValue({ id: "evidence-1" }),
  };
});

const fsMocks = vi.hoisted(() => ({
  stat: vi.fn(async () => ({
    isFile: () => true,
    size: 5,
  })),
  readFile: vi.fn(async () => Buffer.from("hello")),
}));

vi.mock("../client", () => ({
  api: () => ({
    evidence: {
      presign: apiMocks.presign,
      confirmFile: apiMocks.confirmFile,
    },
  }),
}));

vi.mock("node:fs/promises", () => fsMocks);

vi.mock("../io", () => ({
  fail: vi.fn((code: string, message: string) => {
    throw new Error(`${code}: ${message}`);
  }),
}));

import { fail } from "../io";
import { uploadEvidenceFile } from "../upload-file";

describe("uploadEvidenceFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.stat.mockResolvedValue({
      isFile: () => true,
      size: 5,
    });
    fsMocks.readFile.mockResolvedValue(Buffer.from("hello"));
  });
  it("presigns, uploads, and confirms an evidence file", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const row = await uploadEvidenceFile({
      caseId: CASE_ID,
      path: "/tmp/note.txt",
      label: "Note",
    });

    expect(apiMocks.presign).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
    expect(apiMocks.confirmFile).toHaveBeenCalled();
    expect(row).toEqual({ id: "evidence-1" });
  });

  it("fails with USAGE when the file is missing", async () => {
    fsMocks.stat.mockRejectedValueOnce(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );

    await expect(
      uploadEvidenceFile({ caseId: CASE_ID, path: "/tmp/missing.txt" })
    ).rejects.toThrow(/USAGE: File not found/);
    expect(fail).toHaveBeenCalledWith(
      "USAGE",
      "File not found: /tmp/missing.txt",
      expect.objectContaining({ help: expect.any(Array) })
    );
    expect(apiMocks.presign).not.toHaveBeenCalled();
  });

  it("fails with USAGE when the file is empty", async () => {
    fsMocks.stat.mockResolvedValueOnce({
      isFile: () => true,
      size: 0,
    });

    await expect(
      uploadEvidenceFile({ caseId: CASE_ID, path: "/tmp/empty.txt" })
    ).rejects.toThrow(/USAGE: File is empty/);
    expect(apiMocks.presign).not.toHaveBeenCalled();
  });

  it("fails with UPLOAD_FAILED when read fails after stat", async () => {
    fsMocks.readFile.mockRejectedValueOnce(
      Object.assign(new Error("EACCES"), { code: "EACCES" })
    );

    await expect(
      uploadEvidenceFile({ caseId: CASE_ID, path: "/tmp/note.txt" })
    ).rejects.toThrow(/UPLOAD_FAILED/);
    expect(apiMocks.presign).not.toHaveBeenCalled();
  });

  it("fails with UPLOAD_FAILED when MinIO PUT is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 }))
    );

    await expect(
      uploadEvidenceFile({ caseId: CASE_ID, path: "/tmp/note.txt" })
    ).rejects.toThrow(/UPLOAD_FAILED: MinIO upload failed \(403\)/);
    expect(apiMocks.confirmFile).not.toHaveBeenCalled();
  });
});
