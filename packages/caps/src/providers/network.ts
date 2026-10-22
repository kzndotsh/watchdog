import { defineProvider } from "../sdk";

/** The Malware Hash Registry is free for non-commercial use only; the IP-to-ASN service states no commercial restriction. One provider, the stricter verdict. */
export const teamCymru = defineProvider({
  name: "Team Cymru",
  url: "https://www.team-cymru.com/",
  termsUrl: "https://www.team-cymru.com/mhr",
  tier: "free",
  commercialUse: "restricted",
});

/** The terms bar reselling but do not address commercial use. Attribution is required for public display. */
export const ipctl = defineProvider({
  name: "ipctl",
  url: "https://ipctl.io",
  termsUrl: "https://ipctl.io/terms",
  tier: "freemium",
  commercialUse: "unknown",
  attribution: { text: "ipctl.io", url: "https://ipctl.io" },
});

/** The terms allow internal business purposes and bar resale without written consent. */
export const ipinfo = defineProvider({
  name: "IPinfo",
  url: "https://ipinfo.io",
  termsUrl: "https://ipinfo.io/terms-of-service",
  tier: "freemium",
  commercialUse: "restricted",
});

/** The Cap calls the rdap.org redirector, which publishes no terms; each registry's own terms apply behind it. */
export const rdap = defineProvider({
  name: "Domain registries (RDAP)",
  url: "https://about.rdap.org/",
  termsUrl: "https://about.rdap.org/",
  tier: "free",
  commercialUse: "unknown",
});

/** The terms limit use to internal business purposes; use in a commercial product needs a Master Service Agreement. */
export const whoisxml = defineProvider({
  name: "WhoisXML",
  url: "https://www.whoisxmlapi.com",
  termsUrl: "https://main.whoisxmlapi.com/terms-of-service",
  tier: "freemium",
  commercialUse: "restricted",
});

/** The terms bar resale and redistribution and do not address commercial use. */
export const whoxy = defineProvider({
  name: "Whoxy",
  url: "https://www.whoxy.com",
  termsUrl: "https://www.whoxy.com/terms.php",
  tier: "paid",
  commercialUse: "unknown",
});

/** The site publishes no terms. */
export const crtsh = defineProvider({
  name: "crt.sh",
  url: "https://crt.sh",
  termsUrl: "https://crt.sh",
  tier: "free",
  commercialUse: "unknown",
});

/** Keyless queries are for personal or evaluation use; production use needs an API key. */
export const certspotter = defineProvider({
  name: "Cert Spotter",
  url: "https://sslmate.com/certspotter",
  termsUrl: "https://sslmate.com/help/reference/ct_search_api_v1",
  tier: "freemium",
  commercialUse: "restricted",
});

/** The terms bar competing services and do not address commercial use. */
export const c99 = defineProvider({
  name: "C99",
  url: "https://api.c99.nl",
  termsUrl: "https://api.c99.nl/tos",
  tier: "paid",
  commercialUse: "unknown",
});

/** The terms pages returned HTTP 403 during research; no terms text was read. */
export const hackertarget = defineProvider({
  name: "HackerTarget",
  url: "https://hackertarget.com",
  termsUrl: "https://hackertarget.com/ip-tools/",
  tier: "freemium",
  commercialUse: "unknown",
});

/** No terms page; only usage limits are published. */
export const mnemonic = defineProvider({
  name: "mnemonic",
  url: "https://www.mnemonic.no",
  termsUrl:
    "https://docs.mnemonic.no/service-integration-guides/passivedns/docs/public/01-public_api.html",
  tier: "free",
  commercialUse: "unknown",
});

/** The terms say "Commercial use of any part of our service requires express written permission." */
export const urlscan = defineProvider({
  name: "urlscan.io",
  url: "https://urlscan.io",
  termsUrl: "https://urlscan.io/terms/",
  tier: "freemium",
  commercialUse: "restricted",
});

/** Commercial use is listed for Freelancer plans and above, not the entry Membership (billing page; shodan.io/terms returns 404). */
export const shodan = defineProvider({
  name: "Shodan",
  url: "https://www.shodan.io",
  termsUrl: "https://account.shodan.io/billing",
  tier: "paid",
  commercialUse: "restricted",
});

/** Free accounts are barred from commercial use; paying customers may. Non-paying users must cite and link Censys. */
export const censys = defineProvider({
  name: "Censys",
  url: "https://censys.com",
  termsUrl: "https://censys.com/terms-of-service/",
  tier: "freemium",
  commercialUse: "restricted",
  attribution: { text: "Data from Censys", url: "https://censys.com" },
});

/** The terms bar commercial use without a written agreement; Trusted and Enterprise accounts may. */
export const leakix = defineProvider({
  name: "LeakIX",
  url: "https://leakix.net",
  termsUrl: "https://leakix.net/terms-and-conditions",
  tier: "freemium",
  commercialUse: "restricted",
});

/** The exit list carries no terms text. */
export const torProject = defineProvider({
  name: "Tor Project",
  url: "https://www.torproject.org",
  termsUrl: "https://check.torproject.org/exit-addresses",
  tier: "free",
  commercialUse: "unknown",
});

/** No licence or terms are stated for Tranco itself. */
export const tranco = defineProvider({
  name: "Tranco",
  url: "https://tranco-list.eu",
  termsUrl: "https://tranco-list.eu/api_documentation",
  tier: "free",
  commercialUse: "unknown",
});
