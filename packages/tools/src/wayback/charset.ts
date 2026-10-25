/**
 * Decode a capture with the charset the page declares: the Content-Type header, then a
 * `<meta charset>` or `<meta http-equiv="Content-Type">` in the first bytes, then UTF-8.
 * Used only for the comparison copy (hash and text); the stored bytes are never re-encoded.
 */

const META_WINDOW = 4096;

function charsetFromContentType(value: string | null): string | null {
  if (value === null) return null;
  const match = /charset\s*=\s*["']?([\w.:-]+)/i.exec(value);
  return match?.[1] ?? null;
}

function charsetFromMeta(bytes: Uint8Array): string | null {
  // Latin-1 keeps every byte as one character, so ASCII markup reads the same in any charset.
  const head = new TextDecoder("latin1").decode(bytes.slice(0, META_WINDOW));
  const direct = /<meta[^>]{0,200}?charset\s*=\s*["']?([\w.:-]+)/i.exec(head);
  return direct?.[1] ?? null;
}

function decoderFor(label: string | null): TextDecoder | null {
  if (label === null) return null;
  try {
    return new TextDecoder(label, { fatal: false });
  } catch {
    return null;
  }
}

export function decodeCapture(
  bytes: Uint8Array,
  contentType: string | null
): string {
  const decoder =
    decoderFor(charsetFromContentType(contentType)) ??
    decoderFor(charsetFromMeta(bytes)) ??
    new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(bytes);
}
