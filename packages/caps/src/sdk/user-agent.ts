/**
 * The one provider-facing User-Agent format. Caps own it (a tool takes `userAgent` as a
 * required option and never builds one); `defineCollectCap` hands it to `fetch(ctx, { userAgent })`.
 * `contact` is for a vendor that asks for contact details in the string.
 *
 * @canonical `watchdogUserAgent`: Cap HTTP user agent (caps only; never hard-code one; `defineCollectCap` hands it to `fetch(ctx, { userAgent })`, lint-enforced; a tool takes `userAgent` as a required option)
 */
export function watchdogUserAgent(capId: string, contact?: string): string {
  const tail = contact === undefined ? "" : `; contact: ${contact}`;
  return `Watchdog/1.0 (+${capId}; OSINT${tail})`;
}
