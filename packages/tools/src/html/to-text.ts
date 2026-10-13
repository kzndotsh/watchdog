/** Lightweight HTML → plain text (no heavy deps). Good enough for Day-0 enrich. */

const MAX_TEXT = 200_000;
const MAX_LINKS = 200;
/** Longest Markdown link label scanned; bounds the work per `[` on hostile input. */
const MAX_LINK_LABEL = 500;

const ASSET_EXT_RE =
  /\.(?:css|js|mjs|cjs|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|mp4|webm|mp3|pdf)(?:\?|#|$)/i;

/** Resolve href against page URL; returns null if unusable. */
export function resolveHref(href: string, baseUrl: string): string | null {
  const raw = href.trim();
  if (!raw || raw === "#" || raw.startsWith("#")) return null;
  if (/^(javascript|data|blob|about):/i.test(raw)) return null;
  try {
    const u = new URL(raw, baseUrl);
    if (
      u.protocol !== "http:" &&
      u.protocol !== "https:" &&
      u.protocol !== "mailto:"
    ) {
      return null;
    }
    if (u.protocol === "mailto:") {
      const email = decodeURIComponent(u.pathname).split("?")[0]?.trim();
      return email || null;
    }
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

function isUsefulHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (ASSET_EXT_RE.test(u.pathname)) return false;
    const host = u.hostname.toLowerCase();
    if (host === "schema.org" || host.endsWith(".schema.org")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Absolute outbound http(s) URLs + bare emails from mailto: in HTML.
 * Relatives resolved against baseUrl. Assets / noise filtered.
 */
export function extractOutboundFromHtml(
  html: string,
  baseUrl: string
): { urls: string[]; emails: string[] } {
  const urls = new Set<string>();
  const emails = new Set<string>();
  for (const m of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1];
    if (!href) continue;
    const resolved = resolveHref(href, baseUrl);
    if (resolved === null) continue;
    if (resolved.includes("@") && !resolved.startsWith("http")) {
      emails.add(resolved.toLowerCase());
      continue;
    }
    if (isUsefulHttpUrl(resolved)) urls.add(resolved);
  }
  return {
    urls: [...urls].sort((a, b) => a.localeCompare(b)).slice(0, MAX_LINKS),
    emails: [...emails].sort((a, b) => a.localeCompare(b)).slice(0, MAX_LINKS),
  };
}

/** Strip trailing `.,;:` in one linear pass (a `[.,;:]+$` regex is quadratic on a long run). */
function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0 && ".,;:".includes(url.charAt(end - 1))) end -= 1;
  return url.slice(0, end);
}

/** http(s) URLs from Markdown link targets and bare URL tokens. */
export function extractOutboundFromMarkdown(md: string): string[] {
  const urls = new Set<string>();
  for (const m of md.matchAll(
    new RegExp(
      `\\[[^\\]]{0,${MAX_LINK_LABEL}}]\\((https?:\\/\\/[^)\\s]+)\\)`,
      "gi"
    )
  )) {
    const u = m[1];
    if (u && isUsefulHttpUrl(u)) urls.add(trimTrailingPunctuation(u));
  }
  for (const m of md.matchAll(/\bhttps?:\/\/[^\s<>"')\]]+/gi)) {
    const u = m[0] === undefined ? undefined : trimTrailingPunctuation(m[0]);
    if (u && isUsefulHttpUrl(u)) urls.add(u);
  }
  return [...urls].sort((a, b) => a.localeCompare(b)).slice(0, MAX_LINKS);
}

export function formatLinksMarkdownSection(input: {
  urls: string[];
  emails?: string[];
}): string {
  const lines: string[] = ["## Outbound links", ""];
  if (input.urls.length === 0 && !input.emails?.length) {
    lines.push("_None extracted._");
    return lines.join("\n");
  }
  for (const u of input.urls) {
    lines.push(`- ${u}`);
  }
  if (input.emails?.length) {
    lines.push("", "## Emails from markup", "");
    for (const e of input.emails) {
      lines.push(`- ${e}`);
    }
  }
  return lines.join("\n");
}

function decodeNumericEntity(raw: string): string {
  const code = Number(raw);
  if (
    !Number.isInteger(code) ||
    code < 0 ||
    code > 0x10_ff_ff ||
    (code >= 0xd8_00 && code <= 0xdf_ff)
  ) {
    return "";
  }
  return String.fromCodePoint(code);
}

/**
 * Replace every `<open ...> ... <close>` span with a space, in one linear pass.
 * A lazy `[\s\S]*?` regex rescans to the end of the input from every opener, which is
 * quadratic on many unclosed openers. When no end tag follows an opener, none follows
 * a later one either, so the scan stops and the rest of the input is kept as is.
 */
function stripSpans(html: string, openSource: string, closeSource: string) {
  const open = new RegExp(openSource, "gi");
  const close = new RegExp(closeSource, "gi");
  let out = "";
  let pos = 0;
  for (;;) {
    open.lastIndex = pos;
    const start = open.exec(html);
    if (start === null) break;
    close.lastIndex = start.index + start[0].length;
    const end = close.exec(html);
    if (end === null) break;
    out += `${html.slice(pos, start.index)} `;
    pos = end.index + end[0].length;
  }
  return out + html.slice(pos);
}

/** Tags that end a line of text: block closers and `<br>` / `<hr>` (prefix match, as before). */
const LINE_BREAK_TAG = /^<(?:\/(?:p|div|tr|li|h[1-6]|br|hr)|br|hr)/i;

/**
 * Replace each `<...>` tag with a newline (block tags) or a space, in one linear pass.
 * With no `>` left, no later `<` can close either, so the scan stops there.
 */
function replaceTags(html: string): string {
  let out = "";
  let pos = 0;
  for (;;) {
    const lt = html.indexOf("<", pos);
    if (lt === -1) break;
    const gt = html.indexOf(">", lt + 1);
    if (gt === -1) break;
    if (gt === lt + 1) {
      out += html.slice(pos, gt);
      pos = gt;
      continue;
    }
    out +=
      html.slice(pos, lt) +
      (LINE_BREAK_TAG.test(html.slice(lt, gt + 1)) ? "\n" : " ");
    pos = gt + 1;
  }
  return out + html.slice(pos);
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
};

/** Decode the entities we know in one pass, so `&amp;lt;` becomes `&lt;`, not `<`. */
function decodeEntities(text: string): string {
  return text.replaceAll(
    /&(nbsp|amp|lt|gt|quot|#39|#(\d+));/gi,
    (_, name: string, numeric: string | undefined) =>
      numeric === undefined
        ? (NAMED_ENTITIES[name.toLowerCase()] ?? "")
        : decodeNumericEntity(numeric)
  );
}

export function htmlToText(html: string): string {
  let s = html;
  s = stripSpans(s, "<script", "<\\/script\\s*>");
  s = stripSpans(s, "<style", "<\\/style\\s*>");
  s = stripSpans(s, "<noscript", "<\\/noscript\\s*>");
  s = stripSpans(s, "<!--", "-->");
  s = replaceTags(s);
  s = decodeEntities(s);
  s = s
    .split("\n")
    .map((line) => line.replaceAll(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length > MAX_TEXT) {
    return `${s.slice(0, MAX_TEXT)}\n\n…[truncated ${s.length - MAX_TEXT} chars]`;
  }
  return s;
}

export function htmlToMarkdownish(html: string, title?: string): string {
  const text = htmlToText(html);
  const trimmedTitle = title?.trim();
  const heading =
    trimmedTitle !== undefined && trimmedTitle !== ""
      ? `# ${trimmedTitle}\n\n`
      : "";
  return `${heading}${text}`;
}

export function extractTitle(html: string): string | undefined {
  const open = /<title/i.exec(html);
  if (open === null) return undefined;
  const tagEnd = html.indexOf(">", open.index);
  if (tagEnd === -1) return undefined;
  const textEnd = html.indexOf("<", tagEnd + 1);
  if (textEnd === -1 || !/^<\/title>/i.test(html.slice(textEnd, textEnd + 8))) {
    return undefined;
  }
  const t = html
    .slice(tagEnd + 1, textEnd)
    .replaceAll(/\s+/g, " ")
    .trim();
  return t ?? undefined;
}
