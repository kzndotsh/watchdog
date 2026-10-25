import { createHash } from "node:crypto";

import { decodeHtml, isHtml } from "../html/sniff";
import { stripWaybackArtifacts } from "./strip";

export type PreparedCapture = {
  /** What is stored: the capture, with the toolbar and playback scripts removed from HTML. */
  bytes: Uint8Array;
  /** SHA-256 (hex) of `bytes`: two captures with different CDX digests can still match here. */
  contentHash: string;
  /** Something was removed. */
  stripped: boolean;
};

/** Strip an HTML capture and hash what will be stored; any other body is kept as it came. */
export function prepareCapture(
  bytes: Uint8Array,
  contentType: string | null
): PreparedCapture {
  let stored = bytes;
  let stripped = false;
  if (isHtml(contentType, bytes)) {
    const html = decodeHtml(bytes);
    const clean = stripWaybackArtifacts(html);
    if (clean !== html) {
      stored = new TextEncoder().encode(clean);
      stripped = true;
    }
  }
  return {
    bytes: stored,
    contentHash: createHash("sha256").update(stored).digest("hex"),
    stripped,
  };
}
