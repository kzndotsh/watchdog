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

/** The terms bar bots and scrapers without permission and are silent on the API. */
export const snusbase = defineProvider({
  name: "Snusbase",
  url: "https://snusbase.com",
  termsUrl: "https://docs.snusbase.com/terms-of-service",
  tier: "paid",
  commercialUse: "unknown",
});
