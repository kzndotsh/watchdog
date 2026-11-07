/**
 * The whole type is matched (parameters such as `; charset=utf-8` allowed after it): `text/*`,
 * SVG, JSON or XML (also as a `+json` / `+xml` suffix), YAML and JavaScript. A vendor type that
 * only contains "xml" or "html" (DOCX, XLSX, MS HTML Help) is binary.
 */
const TEXT_MIME_PATTERN =
  /^(?:text\/[^;\s]+|image\/svg\+xml|application\/(?:[\w.-]+\+)?(?:json|xml)|application\/(?:x-)?(?:yaml|javascript|ecmascript))\s*(?:;.*)?$/i;

/** MIME types that can be shown as inline text (an Evidence preview, a Job artifact body). */
export function isTextMime(mime: string | null | undefined): boolean {
  if (mime === null || mime === undefined || mime === "") return false;
  return TEXT_MIME_PATTERN.test(mime);
}
