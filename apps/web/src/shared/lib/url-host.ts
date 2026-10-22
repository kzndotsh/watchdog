/** A URL's hostname without a leading `www.`; the text itself when it does not parse. */
export function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
