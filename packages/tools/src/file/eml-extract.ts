/**
 * Linear-time IOC extraction for EML analysis. Every scan is a single forward
 * pass over the text: no pattern here can backtrack, so cost grows with the
 * input length only.
 */

export const MAX_IOCS = 50;

function cp(text: string, index: number): number {
  return text.codePointAt(index) ?? -1;
}

const URL_PREFIX = /https?:\/\//gi;
const URL_STOP = /[\s<>"')]/;

/** Distinct http(s) URLs in first-seen order, until `into` holds `limit`. */
export function extractUrls(
  text: string,
  into: Set<string>,
  limit = MAX_IOCS
): void {
  URL_PREFIX.lastIndex = 0;
  while (into.size < limit) {
    const m = URL_PREFIX.exec(text);
    if (m === null) return;
    const start = m.index + m[0].length;
    let end = start;
    while (end < text.length && !URL_STOP.test(text.charAt(end))) end += 1;
    if (end > start) into.add(text.slice(m.index, end));
    URL_PREFIX.lastIndex = Math.max(end, m.index + 1);
  }
}

function isAlpha(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

function isLocalChar(c: number): boolean {
  return (
    isDigit(c) ||
    isAlpha(c) ||
    c === 0x2e ||
    c === 0x5f ||
    c === 0x25 ||
    c === 0x2b ||
    c === 0x2d
  );
}

function isDomainChar(c: number): boolean {
  return isDigit(c) || isAlpha(c) || c === 0x2e || c === 0x2d;
}

/** End of the domain for the `@` at `at`, or -1 when no valid domain follows. */
function domainEnd(text: string, at: number): number {
  let runEnd = at + 1;
  while (runEnd < text.length && isDomainChar(cp(text, runEnd))) {
    runEnd += 1;
  }
  for (let i = runEnd - 1; i > at + 1; i -= 1) {
    if (cp(text, i) !== 0x2e) continue;
    let j = i + 1;
    while (j < runEnd && isAlpha(cp(text, j))) j += 1;
    if (j - (i + 1) >= 2) return j;
  }
  return -1;
}

/**
 * Distinct lowercased `local@domain.tld` addresses in first-seen order, until
 * `into` holds `limit`. The local part is the run of local characters before
 * an `@`; the domain is the run after it, cut after its last dot that is
 * followed by two or more letters.
 */
export function extractEmails(
  text: string,
  into: Set<string>,
  limit = MAX_IOCS
): void {
  let floor = 0;
  let at = text.indexOf("@");
  while (at !== -1 && into.size < limit) {
    let start = at;
    while (start > floor && isLocalChar(cp(text, start - 1))) start -= 1;
    const end = start < at ? domainEnd(text, at) : -1;
    if (end === -1) {
      at = text.indexOf("@", at + 1);
      continue;
    }
    into.add(text.slice(start, end).toLowerCase());
    floor = end;
    at = text.indexOf("@", end);
  }
}
