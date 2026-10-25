/**
 * Defensive clean-up of a Wayback capture. The `id_` URL already returns the original bytes, but
 * an older capture can still carry the toolbar, the playback scripts or the per-retrieval
 * comments; left in, they differ on every capture and make identical pages look changed.
 * Scans use `indexOf` on an ASCII-lowercased copy (same length as the input), so a hostile body
 * cannot make a pattern backtrack.
 */

const TOOLBAR_OPEN = "<!-- begin wayback toolbar insert -->";
const TOOLBAR_CLOSE = "<!-- end wayback toolbar insert -->";

/** A script element naming one of these is the archive's, not the page's. */
const SCRIPT_MARKERS = [
  "/_static/js/",
  "wombat.js",
  "_wb_wombat",
  "__wm.",
  "archive.org/includes/analytics.js",
  "bundle-playback",
  "ruffleplayer",
  "web-static.archive.org",
];

/** A stylesheet link to the playback banner. */
const LINK_MARKERS = ["/_static/css/", "web-static.archive.org"];

/** Comments the archive appends to a capture. */
const COMMENT_MARKERS = [
  "file archived on",
  "playback timings",
  "wayback machine",
];

function asciiLower(text: string): string {
  return text.replaceAll(/[A-Z]/g, (c) => c.toLowerCase());
}

type Span = { start: number; end: number };

function findSpans(
  lower: string,
  open: string,
  close: string,
  keep: (element: string) => boolean
): Span[] {
  const spans: Span[] = [];
  let from = 0;
  while (from < lower.length) {
    const start = lower.indexOf(open, from);
    if (start === -1) break;
    const closeAt = lower.indexOf(close, start + open.length);
    if (closeAt === -1) break;
    const end = closeAt + close.length;
    if (!keep(lower.slice(start, end))) spans.push({ start, end });
    from = end;
  }
  return spans;
}

function hasMarker(element: string, markers: readonly string[]): boolean {
  return markers.some((marker) => element.includes(marker));
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

function scriptSpans(lower: string): Span[] {
  return findSpans(
    lower,
    "<script",
    "</script>",
    (element) => !hasMarker(element, SCRIPT_MARKERS)
  );
}

function linkSpans(lower: string): Span[] {
  const spans: Span[] = [];
  let from = 0;
  while (from < lower.length) {
    const start = lower.indexOf("<link", from);
    if (start === -1) break;
    const end = lower.indexOf(">", start);
    if (end === -1) break;
    const element = lower.slice(start, end + 1);
    if (hasMarker(element, LINK_MARKERS)) spans.push({ start, end: end + 1 });
    from = end + 1;
  }
  return spans;
}

function commentSpans(lower: string): Span[] {
  return findSpans(
    lower,
    "<!--",
    "-->",
    (element) => !hasMarker(element, COMMENT_MARKERS)
  );
}

/** The capture without the Wayback toolbar, playback scripts, banner CSS and archive comments. */
export function stripWaybackArtifacts(html: string): string {
  let current = html;
  const passes = [
    (lower: string) =>
      findSpans(lower, TOOLBAR_OPEN, TOOLBAR_CLOSE, () => false),
    scriptSpans,
    linkSpans,
    commentSpans,
  ];
  for (const pass of passes) {
    current = cut(current, pass(asciiLower(current)));
  }
  return current;
}
