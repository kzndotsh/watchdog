/** Most characters of an artifact or Evidence body a text preview carries; the rest is cut. */
export const ARTIFACT_TEXT_MAX_CHARS = 50_000;

/** Stored bytes as preview text: UTF-8, cut at `ARTIFACT_TEXT_MAX_CHARS` with a marker. */
export function artifactTextOf(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  return text.length > ARTIFACT_TEXT_MAX_CHARS
    ? `${text.slice(0, ARTIFACT_TEXT_MAX_CHARS)}\n…(truncated)`
    : text;
}
