import { defineProvider } from "../sdk";

/** The public API "must not be used in commercial products or services". */
export const virustotal = defineProvider({
  name: "VirusTotal",
  url: "https://www.virustotal.com",
  termsUrl: "https://docs.virustotal.com/docs/api-overview",
  tier: "freemium",
  commercialUse: "forbidden",
});

/** The legal page says "You may not use Free plans for commercial purposes". */
export const abuseipdb = defineProvider({
  name: "AbuseIPDB",
  url: "https://www.abuseipdb.com",
  termsUrl: "https://abuseipdb.com/legal",
  tier: "freemium",
  commercialUse: "restricted",
});

/** Authenticated access is for not-for-profit use; commercial use may need a paid subscription. Feodo Tracker data is CC0. */
export const abusech = defineProvider({
  name: "abuse.ch",
  url: "https://abuse.ch",
  termsUrl: "https://abuse.ch/terms-of-use/",
  tier: "freemium",
  commercialUse: "restricted",
});

/** The EULA limits the free Community API to internal business or non-commercial use and bars resale. */
export const greynoise = defineProvider({
  name: "GreyNoise",
  url: "https://www.greynoise.io",
  termsUrl: "https://www.greynoise.io/terms",
  tier: "freemium",
  commercialUse: "restricted",
});

/** The pages say free to use and TLP:CLEAR and are silent on commercial use. */
export const circl = defineProvider({
  name: "CIRCL (Computer Incident Response Center Luxembourg)",
  url: "https://www.circl.lu",
  termsUrl: "https://www.circl.lu/services/hashlookup/",
  tier: "free",
  commercialUse: "unknown",
});

/** Commercial use to protect your own network is fine; reselling the data is not. The data is CC BY-NC-SA 4.0. */
export const dshield = defineProvider({
  name: "SANS Internet Storm Center (DShield)",
  url: "https://isc.sans.edu",
  termsUrl: "https://isc.sans.edu/api/",
  tier: "free",
  commercialUse: "restricted",
  attribution: {
    text: "DShield / SANS Internet Storm Center (data licensed CC BY-NC-SA 4.0)",
    url: "https://isc.sans.edu",
  },
});

/** The lists belong to their maintainers; the upstream licences were not verified. */
export const firehol = defineProvider({
  name: "FireHOL IP Lists",
  url: "https://iplists.firehol.org",
  termsUrl: "https://iplists.firehol.org/",
  tier: "free",
  commercialUse: "unknown",
});

/** The EULA says OTX is "free to end users for non-commercial use". */
export const otx = defineProvider({
  name: "AlienVault Open Threat Exchange (LevelBlue)",
  url: "https://otx.alienvault.com",
  termsUrl: "https://www.levelblue.com/terms/otx-eula",
  tier: "free",
  commercialUse: "restricted",
});

/** The Safe Browsing v4 API is "for non-commercial use only"; Web Risk is the commercial alternative. */
export const googleSafeBrowsing = defineProvider({
  name: "Google Safe Browsing",
  url: "https://safebrowsing.google.com",
  termsUrl: "https://developers.google.com/safe-browsing/v4/usage-limits",
  tier: "free",
  commercialUse: "forbidden",
});

/** No terms text was readable on the API or exchange sites. */
export const ibmXforce = defineProvider({
  name: "IBM X-Force Exchange",
  url: "https://exchange.xforce.ibmcloud.com",
  termsUrl: "https://api.xforce.ibmcloud.com/doc/",
  tier: "freemium",
  commercialUse: "unknown",
});

/** The docs state no licence or commercial terms. */
export const greedybear = defineProvider({
  name: "GreedyBear (The Honeynet Project)",
  url: "https://greedybear.honeynet.org",
  termsUrl: "https://greedybear-docs.readthedocs.io/en/latest/Usage.html",
  tier: "free",
  commercialUse: "unknown",
});

/** Free for internal use; a commercial licence is needed to redistribute the data or offer it in a product or service. */
export const honeydb = defineProvider({
  name: "HoneyDB",
  url: "https://honeydb.io",
  termsUrl: "https://honeydb.io/tos",
  tier: "freemium",
  commercialUse: "restricted",
});
