/**
 * Clean-up of a capture's comparison copy (never of the stored artifact). The `id_` URL already
 * returns the original bytes, but an older capture can still carry the toolbar, the playback
 * assets or the per-retrieval comments; left in, they differ on every capture and make
 * identical pages look changed.
 *
 * Only known Wayback injections go, matched on an element's own opening tag (its `src` / `href`
 * host, its `id` / `class`), never on the text of an inline script or style: page code that
 * merely mentions `wombat` or sits under a `/_static/js/` path of its own stays. Scans use
 * `indexOf` on an ASCII-lowercased copy (same length as the input) so a hostile body cannot
 * make a pattern backtrack.
 */

const TOOLBAR_OPEN = "<!-- begin wayback toolbar insert -->";
const TOOLBAR_CLOSE = "<!-- end wayback toolbar insert -->";

const ARCHIVE_HOSTS = new Set([
  "web.archive.org",
  "web-static.archive.org",
  "archive.org",
]);

/** Root-relative paths the archive injects on its own host. */
const ARCHIVE_PATHS = new Set([
  "/_static/js/bundle-playback.js",
  "/_static/js/wombat.js",
  "/_static/js/ruffle/ruffle.js",
  "/_static/css/banner-styles.css",
  "/_static/css/iconochive.css",
]);

/** Ids and classes the archive gives its own elements. */
const ARCHIVE_NAMES = ["wm-ipp", "wombat"];

/** Comments the archive appends to a capture; they open with these words. */
const COMMENT_OPENINGS = ["file archived on", "playback timings"];

const MAX_TAG_CHARS = 4000;

function asciiLower(text: string): string {
  return text.replaceAll(/[A-Z]/g, (c) => c.toLowerCase());
}

type Span = { start: number; end: number };

function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /\s([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined && !found.has(name)) {
      found.set(name, match[2] ?? match[3] ?? match[4] ?? "");
    }
  }
  return found;
}

function isArchiveUrl(value: string | undefined): boolean {
  if (value === undefined) return false;
  const url = value.trim();
  const absolute = /^(?:https?:)?\/\/([^/?#:]+)/.exec(url);
  if (absolute !== null) return ARCHIVE_HOSTS.has(absolute[1] ?? "");
  const path = url.split(/[?#]/)[0] ?? "";
  return ARCHIVE_PATHS.has(path);
}

function hasArchiveName(attrs: Map<string, string>): boolean {
  const names = [
    attrs.get("id") ?? "",
    ...(attrs.get("class") ?? "").split(/\s+/),
  ];
  return names.some((name) =>
    ARCHIVE_NAMES.some((known) => name.startsWith(known))
  );
}

/** The element's own attributes say the archive put it there. */
function isArchiveElement(openingTag: string): boolean {
  const attrs = attributes(openingTag);
  return (
    isArchiveUrl(attrs.get("src")) ||
    isArchiveUrl(attrs.get("href")) ||
    hasArchiveName(attrs)
  );
}

function openingTagEnd(lower: string, start: number): number {
  const end = lower.indexOf(">", start);
  return end === -1 || end - start > MAX_TAG_CHARS ? -1 : end;
}

/** Elements of `name` with a closing tag, removed when their opening tag is the archive's. */
function elementSpans(lower: string, name: string, closes: boolean): Span[] {
  const open = `<${name}`;
  const close = `</${name}>`;
  const spans: Span[] = [];
  let from = 0;
  while (from < lower.length) {
    const start = lower.indexOf(open, from);
    if (start === -1) break;
    const tagEnd = openingTagEnd(lower, start);
    if (tagEnd === -1) {
      from = start + open.length;
      continue;
    }
    const next = lower[start + open.length];
    const isTag =
      next === " " ||
      next === ">" ||
      next === "/" ||
      next === "\n" ||
      next === "\t";
    if (!isTag || !isArchiveElement(lower.slice(start, tagEnd + 1))) {
      from = tagEnd + 1;
      continue;
    }
    if (!closes) {
      spans.push({ start, end: tagEnd + 1 });
      from = tagEnd + 1;
      continue;
    }
    const closeAt = lower.indexOf(close, tagEnd);
    if (closeAt === -1) {
      from = tagEnd + 1;
      continue;
    }
    spans.push({ start, end: closeAt + close.length });
    from = closeAt + close.length;
  }
  return spans;
}

function toolbarSpans(lower: string): Span[] {
  const spans: Span[] = [];
  let from = 0;
  while (from < lower.length) {
    const start = lower.indexOf(TOOLBAR_OPEN, from);
    if (start === -1) break;
    const closeAt = lower.indexOf(TOOLBAR_CLOSE, start);
    if (closeAt === -1) break;
    const end = closeAt + TOOLBAR_CLOSE.length;
    spans.push({ start, end });
    from = end;
  }
  return spans;
}

function commentSpans(lower: string): Span[] {
  const spans: Span[] = [];
  let from = 0;
  while (from < lower.length) {
    const start = lower.indexOf("<!--", from);
    if (start === -1) break;
    const closeAt = lower.indexOf("-->", start + 4);
    if (closeAt === -1) break;
    const end = closeAt + 3;
    const text = lower.slice(start + 4, closeAt).trimStart();
    if (COMMENT_OPENINGS.some((opening) => text.startsWith(opening))) {
      spans.push({ start, end });
    }
    from = end;
  }
  return spans;
}

function cut(html: string, spans: readonly Span[]): string {
  if (spans.length === 0) return html;
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const span of sorted) {
    if (span.start < at) continue;
    out += html.slice(at, span.start);
    at = span.end;
  }
  return out + html.slice(at);
}

/** The comparison copy without the toolbar, archive assets and archive comments. */
export function stripWaybackArtifacts(html: string): string {
  const passes = [
    toolbarSpans,
    (lower: string) => elementSpans(lower, "script", true),
    (lower: string) => elementSpans(lower, "style", true),
    (lower: string) => elementSpans(lower, "link", false),
    commentSpans,
  ];
  let current = html;
  for (const pass of passes) {
    current = cut(current, pass(asciiLower(current)));
  }
  return current;
}
