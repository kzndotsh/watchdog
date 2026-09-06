import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { MAX_UPLOAD_BYTES, sha256HexSchema } from "@watchdog/schemas";

import { api } from "./client";

const PUT_TIMEOUT_MINUTES = 5;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const PUT_TIMEOUT_MS = PUT_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

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
  const trimmedOverride = override?.trim();
  if (trimmedOverride !== undefined && trimmedOverride !== "")
    return trimmedOverride;
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
      throw new Error(`File not found: ${filePath}`, { cause: error });
    }
    throw error;
  }

  if (!info.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  if (info.size < 1) {
    throw new Error("File is empty");
  }
  if (info.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${MAX_UPLOAD_BYTES} byte limit`);
  }

  const buf = await readFile(filePath);
  if (buf.byteLength < 1) {
    throw new Error("File is empty");
  }
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${MAX_UPLOAD_BYTES} byte limit`);
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

  const put = await api().evidence.presign({
    caseId: input.caseId,
    sha256,
    mime,
    byteLength,
    name,
  });

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
    throw new Error(
      `MinIO upload failed (cannot reach ${host}): ${cause}. Presigned URLs use the server's S3_ENDPOINT, not WD_API_URL.`,
      { cause: error }
    );
  }

  if (!res.ok) {
    throw new Error(`MinIO upload failed (${res.status})`);
  }

  try {
    return await api().evidence.confirmFile({
      caseId: input.caseId,
      uri: put.uri,
      sha256: put.sha256,
      mime: put.mime,
      byteLength: put.byteLength,
      ...(input.label !== undefined && input.label !== ""
        ? { label: input.label }
        : {}),
      ...(input.entityId !== undefined && input.entityId !== ""
        ? { entityId: input.entityId }
        : {}),
    });
  } catch (error) {
    const hint =
      `Confirm failed — object may be orphaned in MinIO. Retry with matching metadata:\n` +
      `  uri=${put.uri}\n` +
      `  sha256=${put.sha256}\n` +
      `  mime=${put.mime}\n` +
      `  byteLength=${put.byteLength}`;
    throw new Error(hint, { cause: error });
  }
}
