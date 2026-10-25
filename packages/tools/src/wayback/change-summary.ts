import { decodeHtml, isHtml } from "../html/sniff";
import { extractTitle, htmlToText } from "../html/to-text";
import type { WaybackChangeSummary } from "./history-schema";

/** Lines compared per page and lines quoted per side: the summary stays small on a large page. */
const MAX_LINES = 5000;
const SAMPLE_LINES = 3;
const SAMPLE_CHARS = 120;

export type PageText = { title: string | null; text: string };

/** The page without its `<title>` element: the title is reported on its own, not as a line. */
function withoutTitle(html: string): string {
  const lower = html.replaceAll(/[A-Z]/g, (c) => c.toLowerCase());
  const start = lower.indexOf("<title");
  if (start === -1) return html;
  const close = lower.indexOf("</title>", start);
  if (close === -1) return html;
  return html.slice(0, start) + html.slice(close + "</title>".length);
}

/** Title and visible text of a capture; `null` for a body that is not text (an image, a PDF). */
export function pageTextOf(
  bytes: Uint8Array,
  contentType: string | null
): PageText | null {
  if (isHtml(contentType, bytes)) {
    const html = decodeHtml(bytes);
    return {
      title: extractTitle(html) ?? null,
      text: htmlToText(withoutTitle(html)),
    };
  }
  const type = contentType?.toLowerCase() ?? "";
  if (type.startsWith("text/") || type.includes("json")) {
    return { title: null, text: decodeHtml(bytes).trim() };
  }
  return null;
}

function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, MAX_LINES);
}

function tally(lines: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

/** Lines of `lines` that `other` has no unused copy of, in `lines` order. */
function unmatched(
  lines: readonly string[],
  other: Map<string, number>
): string[] {
  const left = new Map(other);
  const out: string[] = [];
  for (const line of lines) {
    const remaining = left.get(line) ?? 0;
    if (remaining > 0) left.set(line, remaining - 1);
    else out.push(line);
  }
  return out;
}

function sample(lines: readonly string[]): string[] {
  return lines
    .slice(0, SAMPLE_LINES)
    .map((line) =>
      line.length > SAMPLE_CHARS ? `${line.slice(0, SAMPLE_CHARS)}…` : line
    );
}

/**
 * What changed from `previous` to `next`: the title, the visible-text length and a line-level
 * stat. A body that is not text reports no line changes.
 */
export function summarizeChange(
  previous: PageText | null,
  next: PageText | null
): WaybackChangeSummary {
  const before = previous ?? { title: null, text: "" };
  const after = next ?? { title: null, text: "" };
  const beforeLines = linesOf(before.text);
  const afterLines = linesOf(after.text);
  const added = unmatched(afterLines, tally(beforeLines));
  const removed = unmatched(beforeLines, tally(afterLines));
  return {
    titleChanged: before.title !== after.title,
    previousTitle: before.title,
    textLengthDelta: after.text.length - before.text.length,
    linesAdded: added.length,
    linesRemoved: removed.length,
    sampleAdded: sample(added),
    sampleRemoved: sample(removed),
  };
}
