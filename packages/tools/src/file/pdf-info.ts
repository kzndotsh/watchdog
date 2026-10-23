/**
 * Bounded PDF metadata reader: a single forward tokenizer over the first
 * `PDF_SCAN_BYTES` of the file that finds `/Key value` pairs for the
 * Document Information keys Watchdog reports. A name token is read as a whole
 * (so `/Authority` is not `/Author`), and the value is the literal string
 * `( ... )` (nesting and escapes honoured), the hex string `< ... >` or the
 * next token. Every value is cut at `MAX_VALUE_CHARS`.
 */

const PDF_SCAN_BYTES = 256_000;
const MAX_VALUE_CHARS = 80;

const PDF_HINT_KEYS = [
  "/Author",
  "/Creator",
  "/Producer",
  "/Title",
  "/ModDate",
  "/CreationDate",
] as const;

function cp(text: string, index: number): number {
  return text.codePointAt(index) ?? -1;
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([
  0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25,
]);

function isRegular(code: number): boolean {
  return !(WHITESPACE.has(code) || DELIMITERS.has(code));
}

function readName(latin: string, from: number): number {
  let end = from + 1;
  while (end < latin.length && isRegular(cp(latin, end))) end += 1;
  return end;
}

/** End (exclusive) of the value token starting at `from`, bounded by `MAX_VALUE_CHARS`. */
function readValueEnd(latin: string, from: number): number {
  const limit = Math.min(latin.length, from + MAX_VALUE_CHARS);
  const first = cp(latin, from);
  if (first === 0x28) {
    let depth = 0;
    for (let i = from; i < limit; i += 1) {
      const c = cp(latin, i);
      if (c === 0x5c) i += 1;
      else if (c === 0x28) depth += 1;
      else if (c === 0x29) {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
    }
    return limit;
  }
  if (first === 0x3c && cp(latin, from + 1) !== 0x3c) {
    const close = latin.indexOf(">", from);
    return close === -1 || close >= limit ? limit : close + 1;
  }
  if (first === 0x2f) return Math.min(readName(latin, from), limit);
  let end = from;
  while (end < limit && isRegular(cp(latin, end))) end += 1;
  return Math.max(end, Math.min(from + 1, limit));
}

/** `/Key value` hints in `PDF_HINT_KEYS` order, first occurrence of each key. */
export function pdfInfoHints(bytes: Uint8Array): string[] {
  const latin = new TextDecoder("latin1").decode(
    bytes.subarray(0, Math.min(bytes.length, PDF_SCAN_BYTES))
  );
  if (!latin.startsWith("%PDF")) return [];

  const wanted = new Set<string>(PDF_HINT_KEYS);
  const found = new Map<string, string>();
  let i = latin.indexOf("/");
  while (i !== -1 && found.size < wanted.size) {
    const nameEnd = readName(latin, i);
    const name = latin.slice(i, nameEnd);
    if (wanted.has(name) && !found.has(name)) {
      let v = nameEnd;
      while (v < latin.length && WHITESPACE.has(cp(latin, v))) v += 1;
      const value = latin
        .slice(v, readValueEnd(latin, v))
        .replaceAll(/[^ -~]/g, " ");
      found.set(name, `${name} ${value}`.trim());
    }
    i = latin.indexOf("/", Math.max(nameEnd, i + 1));
  }
  return PDF_HINT_KEYS.flatMap((key) => {
    const hint = found.get(key);
    return hint === undefined ? [] : [hint];
  });
}
