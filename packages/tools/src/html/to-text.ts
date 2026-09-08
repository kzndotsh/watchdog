/** Lightweight HTML → plain text (no heavy deps). Good enough for Day-0 enrich. */

const MAX_TEXT = 200_000;
const MAX_LINKS = 200;

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

/** http(s) URLs from Markdown link targets and bare URL tokens. */
export function extractOutboundFromMarkdown(md: string): string[] {
  const urls = new Set<string>();
  for (const m of md.matchAll(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi)) {
    const u = m[1];
    if (u && isUsefulHttpUrl(u)) urls.add(u.replace(/[.,;:]+$/, ""));
  }
  for (const m of md.matchAll(/\bhttps?:\/\/[^\s<>"')\]]+/gi)) {
    const u = m[0]?.replace(/[.,;:]+$/, "");
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

export function htmlToText(html: string): string {
  let s = html;
  s = s.replaceAll(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replaceAll(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replaceAll(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replaceAll(/<!--[\s\S]*?-->/g, " ");
  // Block breaks
  s = s.replaceAll(/<\/(p|div|tr|li|h[1-6]|br|hr)[^>]*>/gi, "\n");
  s = s.replaceAll(/<(br|hr)[^>]*>/gi, "\n");
  s = s.replaceAll(/<[^>]+>/g, " ");
  s = s
    .replaceAll(/&nbsp;/gi, " ")
    .replaceAll(/&amp;/gi, "&")
    .replaceAll(/&lt;/gi, "<")
    .replaceAll(/&gt;/gi, ">")
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;/gi, "'")
    .replaceAll(/&#(\d+);/g, (_, n: string) => decodeNumericEntity(n));
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
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const t = m?.[1]?.replaceAll(/\s+/g, " ").trim();
  return t ?? undefined;
}
