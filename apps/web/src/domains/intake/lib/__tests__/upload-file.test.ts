import { describe, expect, it, vi } from "vitest";

import { testId, testHttpUrl } from "@watchdog/test-kit";

const presignUploadFn = vi.hoisted(() => vi.fn());
const confirmFileUploadFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/intake/intake.functions", () => ({
  presignUploadFn,
  confirmFileUploadFn,
}));

import { uploadFileEvidence } from "@/domains/intake/lib/upload-file";

describe("uploadFileEvidence", () => {
  it("rejects empty files", async () => {
    await expect(
      uploadFileEvidence({
        caseId: testId(10),
        file: new File([], "empty.txt"),
      })
    ).rejects.toThrow("File is empty");
  });

  it("uploads via presign and confirm", async () => {
    const caseId = testId(10);
    const sha256 =
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    presignUploadFn.mockResolvedValue({
      url: testHttpUrl("minio.test/put"),
      headers: { "Content-Type": "text/plain" },
      uri: `${caseId}/${sha256}/note.txt`,
      sha256,
      mime: "text/plain",
      byteLength: file.size,
    });
    confirmFileUploadFn.mockResolvedValue({
      id: testId(40),
      caseId: testId(10),
      kind: "file",
      label: "note.txt",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );

    const created = await uploadFileEvidence({
      caseId,
      file,
      label: "note.txt",
    });

    expect(fetch).toHaveBeenCalledWith(
      testHttpUrl("minio.test/put"),
      expect.objectContaining({ method: "PUT", body: file })
    );
    expect(confirmFileUploadFn).toHaveBeenCalled();
    expect(created.id).toBe(testId(40));

    vi.unstubAllGlobals();
  });

  it("trims padded entityId on confirm", async () => {
    const caseId = testId(10);
    const entityId = testId(20);
    const sha256 =
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    presignUploadFn.mockResolvedValue({
      url: testHttpUrl("minio.test/put"),
      headers: { "Content-Type": "text/plain" },
      uri: `${caseId}/${sha256}/note.txt`,
      sha256,
      mime: "text/plain",
      byteLength: file.size,
    });
    confirmFileUploadFn.mockResolvedValue({
      id: testId(40),
      caseId: testId(10),
      kind: "file",
      label: "note.txt",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );

    await uploadFileEvidence({
      caseId,
      file,
      entityId: `  ${entityId}  `,
    });

    expect(confirmFileUploadFn).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityId }),
    });

    vi.unstubAllGlobals();
  });
});
