import { defineProvider } from "../sdk";

/** The public API "must not be used in commercial products or services". */
export const virustotal = defineProvider({
  name: "VirusTotal",
  url: "https://www.virustotal.com",
  termsUrl: "https://docs.virustotal.com/docs/api-overview",
  tier: "freemium",
  commercialUse: "forbidden",
  hosts: {
    // The public API "must not be used in commercial products or services"; the historic terms
    // bar distributing "material, information ... from the Service".
    "www.virustotal.com": "forbidden",
  },
});

/** The legal page says "You may not use Free plans for commercial purposes". */
export const abuseipdb = defineProvider({
  name: "AbuseIPDB",
  url: "https://www.abuseipdb.com",
  termsUrl: "https://abuseipdb.com/legal",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    // abuseipdb.com/legal §9: not to "copy ... any portion of the Website (including the API and
    // associated data)" without permission.
    "api.abuseipdb.com": "forbidden",
  },
});

/** Authenticated access is for not-for-profit use; commercial use may need a paid subscription. Feodo Tracker data is CC0. */
export const abusech = defineProvider({
  name: "abuse.ch",
  url: "https://abuse.ch",
  termsUrl: "https://abuse.ch/terms-of-use/",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    // abuse.ch/terms-of-use §3.4: Feodo Tracker is "free to use without limitations ... (CC0)".
    "feodotracker.abuse.ch": "allowed",
    // Commercial users "may require a paid subscription" (ToU §4.1); no licence for the data.
    "mb-api.abuse.ch": "unknown",
    "threatfox-api.abuse.ch": "unknown",
    "urlhaus-api.abuse.ch": "unknown",
  },
});

/** The EULA limits the free Community API to internal business or non-commercial use and bars resale. */
export const greynoise = defineProvider({
  name: "GreyNoise",
  url: "https://www.greynoise.io",
  termsUrl: "https://www.greynoise.io/terms",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    // greynoise.io/terms: "sharing with third parties" is a material violation; internal use only.
    "api.greynoise.io": "forbidden",
  },
});

/** The pages say free to use and TLP:CLEAR and are silent on commercial use. Open data is CC BY 4.0 unless a dataset says otherwise. */
export const circl = defineProvider({
  name: "CIRCL",
  url: "https://www.circl.lu",
  termsUrl: "https://www.circl.lu/opendata/",
  tier: "free",
  commercialUse: "unknown",
  attribution: { text: "CIRCL", url: "https://www.circl.lu" },
  hosts: {
    // circl.lu/opendata: CC BY 4.0 unless a dataset states otherwise; TLP:CLEAR.
    "bgpranking-ng.circl.lu": "allowed",
    "hashlookup.circl.lu": "unknown",
  },
});

/** Commercial use to protect your own network is fine; reselling the data is not. The data is CC BY-NC-SA 4.0. */
export const dshield = defineProvider({
  name: "SANS ISC DShield",
  url: "https://isc.sans.edu",
  termsUrl: "https://isc.sans.edu/api/",
  tier: "free",
  commercialUse: "restricted",
  attribution: {
    text: "DShield / SANS Internet Storm Center (data licensed CC BY-NC-SA 4.0)",
    url: "https://isc.sans.edu",
  },
  hosts: {
    // isc.sans.edu/api: CC BY-NC-SA 4.0, "ok to use this data for commercial purposes", "Do not
    // resell the data".
    "isc.sans.edu": "allowed",
  },
});

/** The lists belong to their maintainers; the upstream licences were not verified. */
export const firehol = defineProvider({
  name: "FireHOL",
  url: "https://iplists.firehol.org",
  termsUrl: "https://iplists.firehol.org/",
  tier: "free",
  commercialUse: "unknown",
  hosts: {
    // Each list keeps its maintainer's licence.
    "iplists.firehol.org": "unknown",
  },
});

/** The EULA says OTX is "free to end users for non-commercial use". */
export const otx = defineProvider({
  name: "AlienVault OTX",
  url: "https://otx.alienvault.com",
  termsUrl: "https://www.levelblue.com/terms/otx-eula",
  tier: "free",
  commercialUse: "restricted",
  hosts: {
    // The EULA's third-party bar is about the platform ("as a service bureau"), not a reply.
    "otx.alienvault.com": "unknown",
  },
});

/** The Safe Browsing v4 API is "for non-commercial use only"; Web Risk is the commercial alternative. */
export const googleSafeBrowsing = defineProvider({
  name: "Google Safe Browsing",
  url: "https://safebrowsing.google.com",
  termsUrl: "https://developers.google.com/safe-browsing/v4/usage-limits",
  tier: "free",
  commercialUse: "forbidden",
  hosts: {
    // Google APIs Terms §5(e): not to "distribute ... or sublicense to any third party" returned content.
    "safebrowsing.googleapis.com": "forbidden",
  },
});

/** No terms text was readable on the API or exchange sites. */
export const ibmXforce = defineProvider({
  name: "IBM X-Force Exchange",
  url: "https://exchange.xforce.ibmcloud.com",
  termsUrl: "https://api.xforce.ibmcloud.com/doc/",
  tier: "freemium",
  commercialUse: "unknown",
  hosts: {
    "exchange.xforce.ibmcloud.com": "unknown",
  },
});

/** The feeds are CC BY-NC-SA 4.0 (FEEDS_LICENSE.md); NonCommercial means "not primarily intended for or directed towards commercial advantage or monetary compensation". */
export const greedybear = defineProvider({
  name: "GreedyBear",
  url: "https://greedybear.honeynet.org",
  termsUrl: "https://github.com/honeynet/GreedyBear/blob/main/FEEDS_LICENSE.md",
  tier: "free",
  commercialUse: "restricted",
  attribution: {
    text: "GreedyBear / The Honeynet Project (data licensed CC BY-NC-SA 4.0)",
    url: "https://greedybear.honeynet.org",
  },
  hosts: {
    // FEEDS_LICENSE.md: CC BY-NC-SA 4.0, and NonCommercial is "not primarily intended for or
    // directed towards commercial advantage or monetary compensation": a paid client matter is unclear.
    "greedybear.honeynet.org": "unknown",
  },
});

/** Free for internal use; a commercial licence is needed to redistribute the data or offer it in a product or service. */
export const honeydb = defineProvider({
  name: "HoneyDB",
  url: "https://honeydb.io",
  termsUrl: "https://honeydb.io/tos",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    // honeydb.io/tos §5: "Redistribution includes derived indicators"; needs the Commercial plan.
    "honeydb.io": "forbidden",
  },
});
