import { defineProvider } from "../sdk";

/** The terms bar resale and building a breach search engine; the source must be identified with a link. */
export const hibp = defineProvider({
  name: "Have I Been Pwned",
  url: "https://haveibeenpwned.com",
  termsUrl: "https://haveibeenpwned.com/API/v3",
  tier: "paid",
  commercialUse: "restricted",
  attribution: {
    text: "Data from Have I Been Pwned",
    url: "https://haveibeenpwned.com",
  },
});

/** Only the endpoint documentation was readable; no commercial terms were found. */
export const hudsonRock = defineProvider({
  name: "Hudson Rock",
  url: "https://www.hudsonrock.com",
  termsUrl: "https://docs.hudsonrock.com/reference/search-by-domains",
  tier: "paid",
  commercialUse: "unknown",
});

/** dehashed.com/terms and the docs host were unreachable (403) during research; no terms text was read. */
export const dehashed = defineProvider({
  name: "DeHashed",
  url: "https://dehashed.com",
  termsUrl: "https://dehashed.com",
  tier: "paid",
  commercialUse: "unknown",
});

/**
 * The terms (leakradar.io/en/terms) allow use for your own organisation, or a client you are
 * authorised to assess, and bar re-selling, mirroring or derivative datasets (section 11),
 * redistribution and contacting breach victims (section 3), and scraping the API; commercial
 * services to third parties need a Platinum or Unlimited plan. An API key needs a paid plan.
 */
export const leakradar = defineProvider({
  name: "LeakRadar",
  url: "https://leakradar.io",
  termsUrl: "https://leakradar.io/en/terms",
  tier: "paid",
  commercialUse: "restricted",
});

/** The terms bar bots and scrapers without permission and are silent on the API. */
export const snusbase = defineProvider({
  name: "Snusbase",
  url: "https://snusbase.com",
  termsUrl: "https://docs.snusbase.com/terms-of-service",
  tier: "paid",
  commercialUse: "unknown",
});
