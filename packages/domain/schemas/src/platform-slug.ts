/** Strip a trailing "(…)" group without regex (avoids ReDoS on free text). */
export function stripTrailingParenthetical(text: string): string {
  if (!text.endsWith(")")) return text;
  const open = text.lastIndexOf("(");
  if (open <= 0) return text;
  return text.slice(0, open).trimEnd();
}

function isSpaceChar(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isSlugKeepChar(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "." ||
    ch === "_" ||
    ch === "-"
  );
}

function trimSlugEdges(slug: string): string {
  let out = slug;
  while (out.length > 0 && "._-".includes(out[0] ?? "")) {
    out = out.slice(1);
  }
  while (out.length > 0 && "._-".includes(out.at(-1) ?? "")) {
    out = out.slice(0, -1);
  }
  return out;
}

/** Custom platform slug: lowercase, spaces/junk → `_`, keep `[a-z0-9._-]`. */
export function toCustomPlatformSlug(text: string): string {
  let out = "";
  let prevUnderscore = false;
  for (const ch of text.toLowerCase()) {
    if (isSpaceChar(ch) || !isSlugKeepChar(ch)) {
      if (!prevUnderscore && out.length > 0) {
        out += "_";
        prevUnderscore = true;
      }
      continue;
    }
    out += ch;
    prevUnderscore = ch === "_";
  }
  return trimSlugEdges(out).slice(0, 64);
}
