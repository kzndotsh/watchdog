import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { presignUploadInputSchema } from "@watchdog/schemas/evidence";
import { testCaseId } from "@watchdog/schemas/testing";
import { HttpResponse, http, mockServer } from "@watchdog/test-kit/http";

import { uploadEvidenceFile } from "../upload-file";
import { failureOf, standInApi } from "./stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const CASE_ID = testCaseId(0);
const PUT_URL = "http://objects.test/evidence/object";
const standIn = standInApi();

/** The API's presign + confirm routes, and the object store's PUT (status `putStatus`). */
function serveUpload(putStatus = 200): {
  put: { headers: Headers; body: string }[];
} {
  const put: { headers: Headers; body: string }[] = [];
  standIn.json("post", `/cases/${CASE_ID}/evidence/presign`, (request) => {
    const input = presignUploadInputSchema
      .omit({ caseId: true })
      .parse(request.body);
    return {
      url: PUT_URL,
      uri: `${CASE_ID}/${input.sha256}`,
      sha256: input.sha256,
      mime: input.mime,
      byteLength: input.byteLength,
      headers: {
        "Content-Type": input.mime,
        "x-amz-meta-sha256": input.sha256,
      },
    };
  });
  standIn.json("post", `/cases/${CASE_ID}/evidence/file`, { id: "evidence-1" });
  mockServer.use(
    http.put(PUT_URL, async ({ request }) => {
      put.push({ headers: request.headers, body: await request.text() });
      return new HttpResponse(null, { status: putStatus });
    })
  );
  return { put };
}

describe("uploadEvidenceFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "wd-upload-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function fileWith(name: string, content: string): string {
    const file = path.join(dir, name);
    writeFileSync(file, content);
    return file;
  }

  it("presigns, uploads the bytes with the signed headers, and confirms the Evidence", async () => {
    const { put } = serveUpload();
    const file = fileWith("note.txt", "hello");
    const sha256 = createHash("sha256").update("hello").digest("hex");

    const row = await uploadEvidenceFile({
      caseId: CASE_ID,
      path: file,
      label: "Note",
    });

    expect(row).toEqual({ id: "evidence-1" });
    expect(standIn.seen.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /cases/${CASE_ID}/evidence/presign`,
      `POST /cases/${CASE_ID}/evidence/file`,
    ]);
    expect(standIn.seen[0]?.body).toMatchObject({
      sha256,
      mime: "text/plain",
      byteLength: 5,
      name: "note.txt",
    });
    expect(put).toHaveLength(1);
    expect(put[0]?.body).toBe("hello");
    expect(put[0]?.headers.get("x-amz-meta-sha256")).toBe(sha256);
    expect(standIn.seen[1]?.body).toMatchObject({
      uri: `${CASE_ID}/${sha256}`,
      sha256,
      byteLength: 5,
      label: "Note",
    });
  });

  it("fails USAGE without a request when the file is missing", async () => {
    const missing = path.join(dir, "missing.txt");

    const failure = await failureOf(() =>
      uploadEvidenceFile({ caseId: CASE_ID, path: missing })
    );

    expect(failure.error.code).toBe("USAGE");
    expect(failure.error.message).toBe(`File not found: ${missing}`);
    expect(failure.help?.length).toBeGreaterThan(0);
    expect(standIn.seen).toEqual([]);
  });

  it("fails USAGE without a request when the file is empty", async () => {
    const failure = await failureOf(() =>
      uploadEvidenceFile({ caseId: CASE_ID, path: fileWith("empty.txt", "") })
    );

    expect(failure.error).toMatchObject({
      code: "USAGE",
      message: "File is empty",
    });
    expect(standIn.seen).toEqual([]);
  });

  it("fails USAGE without a request when the path is a directory", async () => {
    const failure = await failureOf(() =>
      uploadEvidenceFile({ caseId: CASE_ID, path: dir })
    );

    expect(failure.error.code).toBe("USAGE");
    expect(failure.error.message).toBe(`Not a file: ${dir}`);
    expect(standIn.seen).toEqual([]);
  });

  it.skipIf(process.getuid?.() === 0)(
    "fails UPLOAD_FAILED without a request when the file cannot be read",
    async () => {
      const file = fileWith("secret.txt", "hello");
      chmodSync(file, 0o000);

      const failure = await failureOf(() =>
        uploadEvidenceFile({ caseId: CASE_ID, path: file })
      );

      expect(failure.error.code).toBe("UPLOAD_FAILED");
      expect(standIn.seen).toEqual([]);
    }
  );

  it("fails UPLOAD_FAILED and does not confirm when the object store refuses the PUT", async () => {
    serveUpload(403);

    const failure = await failureOf(() =>
      uploadEvidenceFile({
        caseId: CASE_ID,
        path: fileWith("note.txt", "hello"),
      })
    );

    expect(failure.error.code).toBe("UPLOAD_FAILED");
    expect(failure.error.message).toBe("Upload failed (403)");
    expect(standIn.seen.map((r) => r.path)).toEqual([
      `/cases/${CASE_ID}/evidence/presign`,
    ]);
  });
});
