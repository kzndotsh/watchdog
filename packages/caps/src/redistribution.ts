import { fixedContactHost } from "@watchdog/schemas/caps";

/**
 * Whether a provider's terms let a private Case Export carry its raw response bodies: an owner
 * or admin hands the zip to their own team, or to a client or lawyer they act for on that
 * matter. It is not about publishing the data, reselling it or feeding another lookup service
 * (the middleman case). The Export cannot tell who receives it, so a verdict is judged for the
 * stricter recipient, a client: terms that let your own employees, contractors or counsel see
 * the data but not a client (Censys, HoneyDB, WhoisXML) are not `allowed`. `allowed` only where the provider's own text permits that handoff,
 * `forbidden` where it bars disclosure to any third party (not only resale), `unknown` when it
 * is silent, contradicts itself or could not be read. Only `allowed` releases a body; `unknown`
 * withholds it exactly as `forbidden` does, so a host nobody reviewed never leaks by default.
 */
export type RedistributionVerdict = "allowed" | "forbidden" | "unknown";

/**
 * The verdict per contact host (the host of a `provider` or `download` contact, the zone of a
 * `dns` contact), in canonical form. Reviewed by hand, like `commercialUse`: a value changes
 * only after someone reads the provider's terms, never from a guess, and `redistribution.test.ts`
 * fails when a Cap declares a host with no entry here (or an entry names a host no Cap declares),
 * so a new vendor cannot ship unreviewed. The verdict attaches to the host, not the Cap: two
 * Caps that call one host share it. The credit line a licence asks for comes from the
 * provider's `attribution`, through the Caps that name the host.
 *
 * Reviewed 2026-10-25 (#513) from each provider's terms, AUP, API docs, licence and FAQ pages.
 * A comment quotes the deciding text; an unannotated `unknown` is silent or unreadable terms.
 */
export const HOST_REDISTRIBUTION: Readonly<
  Record<string, RedistributionVerdict>
> = {
  // abuseipdb.com/legal §9: not to "copy ... any portion of the Website (including the API and
  // associated data)" without permission.
  "api.abuseipdb.com": "forbidden",
  "api.c99.nl": "unknown",
  "api.certspotter.com": "unknown",
  // dehashed.com/legal bars only FCRA screening, spam and unlawful use; silent on sharing.
  "api.dehashed.com": "unknown",
  // GitHub ToS H and AUP bar only spam and selling users' personal information.
  "api.github.com": "allowed",
  // greynoise.io/terms: "sharing with third parties" is a material violation; internal use only.
  "api.greynoise.io": "forbidden",
  "api.hackertarget.com": "unknown",
  "api.hudsonrock.com": "unknown",
  // ipctl.io/terms §7: "use API responses for your own internal purposes"; redistribution is
  // barred only "in a manner that creates a competing service". Credit when shown publicly.
  "api.ipctl.io": "allowed",
  // leakradar.io/en/terms: reports for your own organisation or "a client you are authorised to
  // assess" (client work needs Platinum, Unlimited or Enterprise); bars re-selling, mirroring,
  // bulk exports and complete credentials. A breach Cap's body is never stored or exported.
  "api.leakradar.io": "allowed",
  "api.mnemonic.no": "unknown",
  // "Services" (reproduce, copy, resell) is undefined; the Enterprise Data License is separate.
  "api.shodan.io": "unknown",
  // docs.snusbase.com/terms-of-service §2(b): no "sharing ... personal or sensitive information
  // obtained from our Services without the explicit consent of the affected individuals".
  "api.snusbase.com": "forbidden",
  // whoxy.com/terms.php, API section: no resale, but "This does not prevent you from making the
  // content available to your end users" (the no-redistribution rule is for database orders).
  "api.whoxy.com": "allowed",
  "asn.cymru.com": "unknown",
  // circl.lu/opendata: CC BY 4.0 unless a dataset states otherwise; TLP:CLEAR.
  "bgpranking-ng.circl.lu": "allowed",
  // metrics.torproject.org/collector.html: CC0, all rights "waived".
  "check.torproject.org": "allowed",
  // Sectigo terms of use name crt.sh: "personal, non-commercial use only", must not "provide
  // access to, or transmit any of the material".
  "crt.sh": "forbidden",
  "emailrep.io": "unknown",
  "exchange.xforce.ibmcloud.com": "unknown",
  // abuse.ch/terms-of-use §3.4: Feodo Tracker is "free to use without limitations ... (CC0)".
  "feodotracker.abuse.ch": "allowed",
  // FEEDS_LICENSE.md: CC BY-NC-SA 4.0, and NonCommercial is "not primarily intended for or
  // directed towards commercial advantage or monetary compensation": a paid client matter is unclear.
  "greedybear.honeynet.org": "unknown",
  // "Free for non-commercial use"; what counts as commercial is not defined.
  "hash.cymru.com": "unknown",
  "hashlookup.circl.lu": "unknown",
  // The API page licenses breach data CC BY 4.0, but the terms of use bar "transmitting,
  // distributing ... HIBP Data" and use "for the benefit of a third party (including for use by a
  // related entity ...)"; neither says which wins.
  "haveibeenpwned.com": "unknown",
  // honeydb.io/tos §5: "Redistribution includes derived indicators"; needs the Commercial plan.
  "honeydb.io": "forbidden",
  // FAQ: "we apply as few restrictions as possible"; crawled pages keep their owners' rights.
  "index.commoncrawl.org": "allowed",
  // ipinfo.io/terms-of-service: "internal business purposes"; "external commercial purposes"
  // need consent. Only the separate Lite endpoint is CC BY-SA, and the Cap calls the token API.
  "ipinfo.io": "unknown",
  // Each list keeps its maintainer's licence.
  "iplists.firehol.org": "unknown",
  // isc.sans.edu/api: CC BY-NC-SA 4.0, "ok to use this data for commercial purposes", "Do not
  // resell the data".
  "isc.sans.edu": "allowed",
  "keybase.io": "unknown",
  "keys.mailvelope.com": "unknown",
  "keys.openpgp.org": "unknown",
  "keyserver.ubuntu.com": "unknown",
  // leakix.net/terms-and-conditions §2: no "distribute or disseminate material, data or
  // information" without prior written approval.
  "leakix.net": "forbidden",
  // Commercial users "may require a paid subscription" (ToU §4.1); no licence for the data.
  "mb-api.abuse.ch": "unknown",
  // Developer Terms IV: "do not transfer Spotify Content to third parties".
  "open.spotify.com": "forbidden",
  "origin.asn.cymru.com": "unknown",
  "origin6.asn.cymru.com": "unknown",
  // The EULA's third-party bar is about the platform ("as a service bureau"), not a reply.
  "otx.alienvault.com": "unknown",
  "pgp.mit.edu": "unknown",
  "pgpkeys.eu": "unknown",
  // A registry's own terms can arrive in the reply's `notices`; they vary by registry.
  "rdap.org": "unknown",
  // Google APIs Terms §5(e): not to "distribute ... or sublicense to any third party" returned content.
  "safebrowsing.googleapis.com": "forbidden",
  // censys.com terms and conditions §3.1(b): not to "provide the Service or any Censys Property ...
  // to any third party, including as a stand-alone product, service, application, file, report
  // or database".
  "search.censys.io": "forbidden",
  "secure.gravatar.com": "unknown",
  // Terms of use: no "transfer, share, distribute or otherwise use or exploit any Content".
  "soundcloud.com": "forbidden",
  "threatfox-api.abuse.ch": "unknown",
  "tranco-list.eu": "unknown",
  "urlhaus-api.abuse.ch": "unknown",
  // urlscan.io/about/faq: use "for things like SOC processes, investigations, reports is totally
  // fine"; asks first only for high volume or a commercial offering.
  "urlscan.io": "allowed",
  "vimeo.com": "unknown",
  "web.archive.org": "unknown",
  // The API terms limit caching photos; an oEmbed reply holds only text and a thumbnail URL.
  "www.flickr.com": "unknown",
  "www.tiktok.com": "unknown",
  // The public API "must not be used in commercial products or services"; the historic terms
  // bar distributing "material, information ... from the Service".
  "www.virustotal.com": "forbidden",
  // main.whoisxmlapi.com/terms-of-service §4.5: not to "make available the Data to any third
  // party" without a written licence.
  "www.whoisxmlapi.com": "forbidden",
  // Terms of service: no access "using any automated means".
  "www.youtube.com": "forbidden",
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
