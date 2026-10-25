import { createHash } from "node:crypto";

import { isHtml } from "../html/sniff";
import { decodeCapture } from "./charset";
import { stripWaybackArtifacts } from "./strip";

export type PreparedCapture = {
  /** SHA-256 (hex) of the bytes exactly as received: what the Evidence artifact stores. */
  rawSha256: string;
  /**
   * SHA-256 (hex) of the comparison copy: an HTML capture decoded with its declared charset
   * and stripped of Wayback furniture, any other body as received. Two captures with
   * different CDX digests can still match here.
   */
  contentHash: string;
};

function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Hash a capture twice. The stored artifact is the raw bytes and is never touched; stripping
 * and decoding happen on a comparison copy that drives dedupe.
 */
export function prepareCapture(
  bytes: Uint8Array,
  contentType: string | null
): PreparedCapture {
  const rawSha256 = sha256(bytes);
  if (!isHtml(contentType, bytes)) return { rawSha256, contentHash: rawSha256 };
  const comparison = stripWaybackArtifacts(decodeCapture(bytes, contentType));
  return { rawSha256, contentHash: sha256(comparison) };
}
