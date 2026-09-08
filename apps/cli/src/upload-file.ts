import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  MAX_UPLOAD_BYTES,
  confirmFileUploadInputSchema,
  mimeInputSchema,
  presignUploadInputSchema,
  sha256HexSchema,
} from "@watchdog/schemas";

import { api } from "./client";
import { fail } from "./io";
import { pickDefined } from "./noun";

const PUT_TIMEOUT_MINUTES = 5;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const PUT_TIMEOUT_MS = PUT_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

const UPLOAD_HELP = ["wd evidence file -c <caseId> <path>"];

const MIME_BY_EXT: Record<string, string> = {
  ".csv": "text/csv",
  ".eml": "message/rfc822",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

function guessMime(filePath: string, override?: string): string {
  if (override !== undefined) {
    return mimeInputSchema.parse(override);
  }
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function sha256HexBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function readEvidenceFile(filePath: string): Promise<Buffer> {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(filePath);
  } catch (error) {
    const code =
      error !== null && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") {
      fail("USAGE", `File not found: ${filePath}`, { help: UPLOAD_HELP });
    }
    const message =
      error instanceof Error ? error.message : "failed to read file metadata";
    fail("UPLOAD_FAILED", message, { help: UPLOAD_HELP });
  }

  if (!info.isFile()) {
    fail("USAGE", `Not a file: ${filePath}`, { help: UPLOAD_HELP });
  }
  if (info.size < 1) {
    fail("USAGE", "File is empty", { help: UPLOAD_HELP });
  }
  if (info.size > MAX_UPLOAD_BYTES) {
    fail("USAGE", `File exceeds ${MAX_UPLOAD_BYTES} byte limit`, {
      help: UPLOAD_HELP,
    });
  }

  let buf: Buffer;
  try {
    buf = await readFile(filePath);
  } catch (error) {
    const code =
      error !== null && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") {
      fail("USAGE", `File not found: ${filePath}`, { help: UPLOAD_HELP });
    }
    const message =
      error instanceof Error ? error.message : "failed to read file";
    fail("UPLOAD_FAILED", message, { help: UPLOAD_HELP });
  }
  if (buf.byteLength < 1) {
    fail("USAGE", "File is empty", { help: UPLOAD_HELP });
  }
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    fail("USAGE", `File exceeds ${MAX_UPLOAD_BYTES} byte limit`, {
      help: UPLOAD_HELP,
    });
  }
  return buf;
}

interface UploadEvidenceFileInput {
  caseId: string;
  path: string;
  label?: string;
  entityId?: string;
  mime?: string;
}

export async function uploadEvidenceFile(input: UploadEvidenceFileInput) {
  const buf = await readEvidenceFile(input.path);
  const sha256 = sha256HexSchema.parse(sha256HexBuffer(buf));
  const mime = guessMime(input.path, input.mime);
  const name = path.basename(input.path);
  const byteLength = buf.byteLength;

  const presign = presignUploadInputSchema.parse({
    caseId: input.caseId,
    sha256,
    mime,
    byteLength,
    name,
  });

  const put = await api().evidence.presign(presign);

  let res: Response;
  try {
    res = await fetch(put.url, {
      method: "PUT",
      headers: put.headers,
      body: new Uint8Array(buf),
      signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
    });
  } catch (error) {
    let host = put.url;
    try {
      host = new URL(put.url).host;
    } catch {
      // keep raw url
    }
    const cause =
      error instanceof Error ? error.message : "unknown connection error";
    return fail(
      "UPLOAD_FAILED",
      `MinIO upload failed (cannot reach ${host}): ${cause}. Presigned URLs use the server's S3_ENDPOINT, not WD_API_URL.`,
      { help: UPLOAD_HELP }
    );
  }

  if (!res.ok) {
    return fail("UPLOAD_FAILED", `MinIO upload failed (${res.status})`, {
      help: UPLOAD_HELP,
    });
  }

  try {
    return await api().evidence.confirmFile(
      confirmFileUploadInputSchema.parse({
        caseId: input.caseId,
        uri: put.uri,
        sha256: put.sha256,
        mime: put.mime,
        byteLength: put.byteLength,
        ...pickDefined({
          label: input.label,
          entityId: input.entityId,
        }),
      })
    );
  } catch (error) {
    const hint =
      `Confirm failed — object may be orphaned in MinIO. Retry with matching metadata:\n` +
      `  uri=${put.uri}\n` +
      `  sha256=${put.sha256}\n` +
      `  mime=${put.mime}\n` +
      `  byteLength=${put.byteLength}`;
    const detail = error instanceof Error ? error.message : String(error);
    return fail("UPLOAD_FAILED", `${hint}\n${detail}`, { help: UPLOAD_HELP });
  }
}
