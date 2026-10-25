import { createHash } from "node:crypto";

import type { RequestBodyRecord } from "./provider-call";
import type { SafeFetchInit } from "./safe-fetch";

function sha256Of(bytes: Uint8Array | string): RequestBodyRecord {
  const data = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  return {
    state: "hashed",
    sha256: createHash("sha256").update(data).digest("hex"),
    bytes: data.byteLength,
  };
}

/** A request body as its SHA-256 and size; never the body. A stream or form data is `unhashable`. */
export async function describeRequestBody(
  body: SafeFetchInit["body"]
): Promise<RequestBodyRecord> {
  if (body === undefined || body === null) return { state: "none" };
  if (typeof body === "string") return sha256Of(body);
  if (body instanceof URLSearchParams) return sha256Of(body.toString());
  if (body instanceof ArrayBuffer) return sha256Of(new Uint8Array(body));
  if (ArrayBuffer.isView(body)) {
    return sha256Of(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    );
  }
  if (body instanceof Blob)
    return sha256Of(new Uint8Array(await body.arrayBuffer()));
  return { state: "unhashable" };
}
