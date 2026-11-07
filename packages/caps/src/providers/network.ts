import { defineProvider } from "../sdk";

/** The Malware Hash Registry is free for non-commercial use only; the IP-to-ASN service states no commercial restriction. One provider, the stricter verdict. */
export const teamCymru = defineProvider({
  name: "Team Cymru",
  url: "https://www.team-cymru.com/",
  termsUrl: "https://www.team-cymru.com/mhr",
  tier: "free",
  commercialUse: "restricted",
  hosts: {
    "asn.cymru.com": "unknown",
    // "Free for non-commercial use"; what counts as commercial is not defined.
    "hash.cymru.com": "unknown",
    "origin.asn.cymru.com": "unknown",
    "origin6.asn.cymru.com": "unknown",
  },
});

/** The terms bar reselling but do not address commercial use. Attribution is required for public display. */
export const ipctl = defineProvider({
  name: "ipctl",
  url: "https://ipctl.io",
  termsUrl: "https://ipctl.io/terms",
  tier: "freemium",
  commercialUse: "unknown",
  attribution: { text: "ipctl.io", url: "https://ipctl.io" },
  hosts: {
    // ipctl.io/terms §7: "use API responses for your own internal purposes"; redistribution is
    // barred only "in a manner that creates a competing service". Credit when shown publicly.
    "api.ipctl.io": "allowed",
  },
});

/** The terms allow internal business purposes and bar resale without written consent. */
export const ipinfo = defineProvider({
  name: "IPinfo",
  url: "https://ipinfo.io",
  termsUrl: "https://ipinfo.io/terms-of-service",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    // ipinfo.io/terms-of-service: "internal business purposes"; "external commercial purposes"
    // need consent. Only the separate Lite endpoint is CC BY-SA, and the Cap calls the token API.
    "ipinfo.io": "unknown",
  },
});

/** The Cap calls the rdap.org redirector, which publishes no terms; each registry's own terms apply behind it. */
export const rdap = defineProvider({
  name: "Domain registries (RDAP)",
  url: "https://about.rdap.org/",
  termsUrl: "https://about.rdap.org/",
  tier: "free",
  commercialUse: "unknown",
  hosts: {
    // A registry's own terms can arrive in the reply's `notices`; they vary by registry.
    "rdap.org": "unknown",
  },
});

/** The terms limit use to internal business purposes; use in a commercial product needs a Master Service Agreement. */
export const whoisxml = defineProvider({
  name: "WhoisXML",
  url: "https://www.whoisxmlapi.com",
  termsUrl: "https://main.whoisxmlapi.com/terms-of-service",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    // main.whoisxmlapi.com/terms-of-service §4.5: not to "make available the Data to any third
    // party" without a written licence.
    "www.whoisxmlapi.com": "forbidden",
  },
});

/** The terms bar resale and redistribution and do not address commercial use. */
export const whoxy = defineProvider({
  name: "Whoxy",
  url: "https://www.whoxy.com",
  termsUrl: "https://www.whoxy.com/terms.php",
  tier: "paid",
  commercialUse: "unknown",
  hosts: {
    // whoxy.com/terms.php allows "making the content available to your end users", but WHOIS data
    // "may be the intellectual property of the source" and its restrictions apply (as for rdap.org).
    "api.whoxy.com": "unknown",
  },
});

/** The site publishes no terms. */
export const crtsh = defineProvider({
  name: "crt.sh",
  url: "https://crt.sh",
  termsUrl: "https://crt.sh",
  tier: "free",
  commercialUse: "unknown",
  hosts: {
    // Sectigo terms of use name crt.sh: "personal, non-commercial use only", must not "provide
    // access to, or transmit any of the material".
    "crt.sh": "forbidden",
  },
});

/** Keyless queries are for personal or evaluation use; production use needs an API key. */
export const certspotter = defineProvider({
  name: "Cert Spotter",
  url: "https://sslmate.com/certspotter",
  termsUrl: "https://sslmate.com/help/reference/ct_search_api_v1",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    "api.certspotter.com": "unknown",
  },
});

/** The terms bar competing services and do not address commercial use. */
export const c99 = defineProvider({
  name: "C99",
  url: "https://api.c99.nl",
  termsUrl: "https://api.c99.nl/tos",
  tier: "paid",
  commercialUse: "unknown",
  hosts: {
    "api.c99.nl": "unknown",
  },
});

/** The terms pages returned HTTP 403 during research; no terms text was read. */
export const hackertarget = defineProvider({
  name: "HackerTarget",
  url: "https://hackertarget.com",
  termsUrl: "https://hackertarget.com/ip-tools/",
  tier: "freemium",
  commercialUse: "unknown",
  hosts: {
    "api.hackertarget.com": "unknown",
  },
});

/** No terms page; only usage limits are published. */
export const mnemonic = defineProvider({
  name: "mnemonic",
  url: "https://www.mnemonic.no",
  termsUrl:
    "https://docs.mnemonic.no/service-integration-guides/passivedns/docs/public/01-public_api.html",
  tier: "free",
  commercialUse: "unknown",
  hosts: {
    "api.mnemonic.no": "unknown",
  },
});

/** The terms say "Commercial use of any part of our service requires express written permission." */
export const urlscan = defineProvider({
  name: "urlscan.io",
  url: "https://urlscan.io",
  termsUrl: "https://urlscan.io/terms/",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    // urlscan.io/about/faq: use "for things like SOC processes, investigations, reports is totally
    // fine"; asks first only for high volume or a commercial offering.
    "urlscan.io": "allowed",
  },
});

/** Commercial use is listed for Freelancer plans and above, not the entry Membership (billing page; shodan.io/terms returns 404). */
export const shodan = defineProvider({
  name: "Shodan",
  url: "https://www.shodan.io",
  termsUrl: "https://account.shodan.io/billing",
  tier: "paid",
  commercialUse: "restricted",
  hosts: {
    // "Services" (reproduce, copy, resell) is undefined; the Enterprise Data License is separate.
    "api.shodan.io": "unknown",
  },
});

/** Free accounts are barred from commercial use; paying customers may. Non-paying users must cite and link Censys. */
export const censys = defineProvider({
  name: "Censys",
  url: "https://censys.com",
  termsUrl: "https://censys.com/terms-of-service/",
  tier: "freemium",
  commercialUse: "restricted",
  attribution: { text: "Data from Censys", url: "https://censys.com" },
  hosts: {
    // censys.com terms and conditions §3.1(b): not to "provide the Service or any Censys Property ...
    // to any third party, including as a stand-alone product, service, application, file, report
    // or database".
    "search.censys.io": "forbidden",
  },
});

/** The terms bar commercial use without a written agreement; Trusted and Enterprise accounts may. */
export const leakix = defineProvider({
  name: "LeakIX",
  url: "https://leakix.net",
  termsUrl: "https://leakix.net/terms-and-conditions",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    // leakix.net/terms-and-conditions §2: no "distribute or disseminate material, data or
    // information" without prior written approval.
    "leakix.net": "forbidden",
  },
});

/** The exit list carries no terms text. */
export const torProject = defineProvider({
  name: "Tor Project",
  url: "https://www.torproject.org",
  termsUrl: "https://check.torproject.org/exit-addresses",
  tier: "free",
  commercialUse: "unknown",
  hosts: {
    // metrics.torproject.org/collector.html: CC0, all rights "waived".
    "check.torproject.org": "allowed",
  },
});

/** No licence or terms are stated for Tranco itself. */
export const tranco = defineProvider({
  name: "Tranco",
  url: "https://tranco-list.eu",
  termsUrl: "https://tranco-list.eu/api_documentation",
  tier: "free",
  commercialUse: "unknown",
  hosts: {
    "tranco-list.eu": "unknown",
  },
});
