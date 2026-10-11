/** Forum quote headers flattened into post bodies (IPB / phpBB). */

const QUOTE_IPB =
  /(?:On \d{1,2}\/\d{1,2}\/\d{2,4} at [\d:]+\s?[AP]M,\s+|\d+\s+(?:hours?|minutes?|days?|weeks?|months?)\s+ago,\s+)([\w %+.-]{2,25})\s+said:/gi;

const QUOTE_PHPBB =
  /([\w .-]{2,25})\s+wrote:\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\w{3}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*[ap]m/gi;

type QuoteHeader = {
  index: number;
  headerEnd: number;
  author: string;
};

function findQuoteHeaders(text: string): QuoteHeader[] {
  const headers: QuoteHeader[] = [];
  for (const re of [QUOTE_IPB, QUOTE_PHPBB]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      headers.push({
        index: m.index ?? 0,
        headerEnd: (m.index ?? 0) + m[0].length,
        author: (m[1] ?? "").trim(),
      });
    }
  }
  headers.sort((a, b) => a.index - b.index);
  return headers;
}

function quotedSpanEnd(
  text: string,
  headerEnd: number,
  nextHeaderIndex: number
): number {
  const rest = text.slice(headerEnd, nextHeaderIndex);
  const blank = /\n\s*\n/.exec(rest);
  if (blank && blank.index !== undefined) {
    return headerEnd + blank.index;
  }
  return nextHeaderIndex;
}

/** Mask quoted spans; keep text before/after harvestable. */
export function maskQuotedSpans(text: string): {
  cleaned: string;
  quotedAuthor: string | null;
} {
  const headers = findQuoteHeaders(text);
  if (headers.length === 0) {
    return { cleaned: text, quotedAuthor: null };
  }

  const ranges: { start: number; end: number }[] = [];
  for (const [i, header] of headers.entries()) {
    if (!header) continue;
    const last = ranges.at(-1);
    if (last && header.index < last.end) continue;
    const nextStart = headers[i + 1]?.index ?? text.length;
    ranges.push({
      start: header.index,
      end: quotedSpanEnd(text, header.headerEnd, nextStart),
    });
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const range of ranges) {
    parts.push(
      text.slice(cursor, range.start),
      " ".repeat(range.end - range.start)
    );
    cursor = range.end;
  }
  parts.push(text.slice(cursor));
  const cleaned = parts.join("");

  const quotedAuthor = headers[0]?.author;
  return {
    cleaned,
    quotedAuthor:
      quotedAuthor === undefined || quotedAuthor === "" ? null : quotedAuthor,
  };
}
