const TEXT_MIME_PATTERN =
  /^(text\/|.*json.*|.*xml.*|.*html.*|.*yaml.*|.*javascript.*)/;

/** MIME types that can be shown as inline text (an Evidence preview, a Job artifact body). */
export function isTextMime(mime: string | null | undefined): boolean {
  if (mime === null || mime === undefined || mime === "") return false;
  return TEXT_MIME_PATTERN.test(mime);
}
