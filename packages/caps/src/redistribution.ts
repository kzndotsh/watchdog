import { fixedContactHost } from "@watchdog/schemas/caps";

/**
 * Whether a provider's terms let the Export carry its raw response bodies to someone else:
 * `allowed` only where the provider's own text says so, `forbidden` where it bars redistribution,
 * `unknown` when it is silent, unclear or not yet read. Only `allowed` releases a body; `unknown`
 * withholds it exactly as `forbidden` does, so a host nobody reviewed never leaks by default.
 */
export type RedistributionVerdict = "allowed" | "forbidden" | "unknown";

/**
 * The verdict per contact host (the host of a `provider` or `download` contact, the zone of a
 * `dns` contact), in canonical form. Reviewed by hand, like `commercialUse`: a value changes
 * only after someone reads the provider's terms, never from a guess, and `redistribution.test.ts`
 * fails when a Cap declares a host with no entry here (or an entry names a host no Cap declares),
 * so a new vendor cannot ship unreviewed. The verdict attaches to the host, not the Cap: two
 * Caps that call one host share it.
 *
 * Every entry is `unknown` until the owner records one. No provider constant states an explicit
 * permission to redistribute responses (`commercialUse` is about use, not about handing the
 * data on), so none is `allowed`. The credit line of a provider comes from its `provider`
 * block's `attribution`, through the Caps that name the host.
 */
export const HOST_REDISTRIBUTION: Readonly<
  Record<string, RedistributionVerdict>
> = {
  "api.abuseipdb.com": "unknown",
  "api.c99.nl": "unknown",
  "api.certspotter.com": "unknown",
  "api.dehashed.com": "unknown",
  "api.github.com": "unknown",
  "api.greynoise.io": "unknown",
  "api.hackertarget.com": "unknown",
  "api.hudsonrock.com": "unknown",
  "api.ipctl.io": "unknown",
  "api.mnemonic.no": "unknown",
  "api.shodan.io": "unknown",
  "api.snusbase.com": "unknown",
  "api.whoxy.com": "unknown",
  "asn.cymru.com": "unknown",
  "bgpranking-ng.circl.lu": "unknown",
  "check.torproject.org": "unknown",
  "crt.sh": "unknown",
  "emailrep.io": "unknown",
  "exchange.xforce.ibmcloud.com": "unknown",
  "feodotracker.abuse.ch": "unknown",
  "greedybear.honeynet.org": "unknown",
  "hash.cymru.com": "unknown",
  "hashlookup.circl.lu": "unknown",
  "haveibeenpwned.com": "unknown",
  "honeydb.io": "unknown",
  "index.commoncrawl.org": "unknown",
  "ipinfo.io": "unknown",
  "iplists.firehol.org": "unknown",
  "isc.sans.edu": "unknown",
  "keybase.io": "unknown",
  "keys.openpgp.org": "unknown",
  "keyserver.ubuntu.com": "unknown",
  "leakix.net": "unknown",
  "mb-api.abuse.ch": "unknown",
  "open.spotify.com": "unknown",
  "origin.asn.cymru.com": "unknown",
  "origin6.asn.cymru.com": "unknown",
  "otx.alienvault.com": "unknown",
  "rdap.org": "unknown",
  "safebrowsing.googleapis.com": "unknown",
  "search.censys.io": "unknown",
  "secure.gravatar.com": "unknown",
  "soundcloud.com": "unknown",
  "threatfox-api.abuse.ch": "unknown",
  "tranco-list.eu": "unknown",
  "urlhaus-api.abuse.ch": "unknown",
  "urlscan.io": "unknown",
  "vimeo.com": "unknown",
  "web.archive.org": "unknown",
  "www.flickr.com": "unknown",
  "www.tiktok.com": "unknown",
  "www.virustotal.com": "unknown",
  "www.whoisxmlapi.com": "unknown",
  "www.youtube.com": "unknown",
};

/** The reviewed verdict of a contact host; a host with no entry is `unknown`. */
export function redistributionVerdictFor(host: string): RedistributionVerdict {
  const key = fixedContactHost({
    kind: "provider",
    host,
    access: "anonymous",
  });
  if (key === undefined || !Object.hasOwn(HOST_REDISTRIBUTION, key)) {
    return "unknown";
  }
  return HOST_REDISTRIBUTION[key] ?? "unknown";
}
