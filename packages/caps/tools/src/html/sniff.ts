export function mergeUnique(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort((left, right) =>
    left.localeCompare(right)
  );
}

export function decodeHtml(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function isHtml(contentType: string | null, bytes: Uint8Array): boolean {
  if (contentType?.toLowerCase().includes("html") === true) return true;
  const head = decodeHtml(bytes.slice(0, 256)).toLowerCase();
  return head.includes("<html") || head.includes("<!doctype");
}

export function isMarkdown(contentType: string | null): boolean {
  const ct = contentType?.toLowerCase() ?? "";
  return ct.includes("text/markdown") || ct.includes("text/x-markdown");
}
