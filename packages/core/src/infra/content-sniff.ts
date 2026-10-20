/**
 * Content type from the leading bytes of a stored file, for the few formats with a fixed
 * signature. It is a consistency check on what an uploader declared, not a classifier: a file
 * whose bytes name one of these formats must not be recorded as a different type, and a file
 * with no recognised signature (text, JSON, CSV, e-mail, anything else) is not judged.
 */

/** Leading bytes the sniffer reads; the caller keeps at least this many. */
export const SNIFF_BYTES = 1024;

type Signature = {
  /** The format's canonical media type. */
  readonly mime: string;
  /** Whether a declared type may legitimately carry this format. */
  readonly accepts: (declared: string) => boolean;
  readonly matches: (head: Uint8Array) => boolean;
};

function startsWith(head: Uint8Array, bytes: readonly number[], at = 0) {
  return bytes.every((byte, index) => head[at + index] === byte);
}

function ascii(text: string): number[] {
  return [...Buffer.from(text, "ascii")];
}

function includesAscii(head: Uint8Array, text: string): boolean {
  const needle = ascii(text);
  for (let at = 0; at + needle.length <= head.length; at += 1) {
    if (startsWith(head, needle, at)) return true;
  }
  return false;
}

/** ZIP containers: plain archives and the office, document and package formats built on them. */
function acceptsZipFamily(declared: string): boolean {
  return (
    declared === "application/zip" ||
    declared === "application/x-zip" ||
    declared === "application/x-zip-compressed" ||
    declared === "application/epub+zip" ||
    declared === "application/java-archive" ||
    declared === "application/vnd.android.package-archive" ||
    declared.startsWith("application/vnd.openxmlformats-officedocument.") ||
    declared.startsWith("application/vnd.oasis.opendocument.") ||
    declared.endsWith("+zip")
  );
}

const SIGNATURES: readonly Signature[] = [
  {
    mime: "image/png",
    accepts: (declared) => declared === "image/png",
    matches: (head) =>
      startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mime: "image/jpeg",
    accepts: (declared) => declared === "image/jpeg",
    matches: (head) => startsWith(head, [0xff, 0xd8, 0xff]),
  },
  {
    mime: "image/gif",
    accepts: (declared) => declared === "image/gif",
    matches: (head) =>
      startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a")),
  },
  {
    mime: "image/webp",
    accepts: (declared) => declared === "image/webp",
    matches: (head) =>
      startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8),
  },
  {
    mime: "application/pdf",
    accepts: (declared) => declared === "application/pdf",
    // The PDF spec lets a few junk bytes precede the header.
    matches: (head) => includesAscii(head, "%PDF-"),
  },
  {
    mime: "application/zip",
    accepts: acceptsZipFamily,
    matches: (head) =>
      startsWith(head, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWith(head, [0x50, 0x4b, 0x05, 0x06]),
  },
  {
    mime: "application/gzip",
    accepts: (declared) =>
      declared === "application/gzip" || declared === "application/x-gzip",
    matches: (head) => startsWith(head, [0x1f, 0x8b]),
  },
];

const ALIASES: Readonly<Record<string, string>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
};

/** Lowercase media type without parameters (`Text/Plain; charset=utf-8` is `text/plain`). */
export function normalizeMime(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALIASES[base] ?? base;
}

/** The media type the leading bytes name, or `null` when no known signature matches. */
export function sniffMime(head: Uint8Array): string | null {
  const found = SIGNATURES.find((signature) => signature.matches(head));
  return found?.mime ?? null;
}

/**
 * Whether the declared type contradicts the bytes. `application/octet-stream` and a blank type
 * declare nothing and never contradict; bytes with no known signature never contradict.
 */
export function contradictsContent(
  declared: string,
  head: Uint8Array
): boolean {
  const type = normalizeMime(declared);
  if (type === "" || type === "application/octet-stream") return false;
  const found = SIGNATURES.find((signature) => signature.matches(head));
  return found !== undefined && !found.accepts(type);
}
