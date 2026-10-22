import { defineProvider } from "../sdk";

/** The Terms of Use page renders no text to an automated reader and states nothing on automated or commercial use that was readable. */
export const internetArchive = defineProvider({
  name: "Internet Archive",
  url: "https://archive.org",
  termsUrl: "https://archive.org/about/terms.php",
  tier: "free",
  commercialUse: "unknown",
});

/** The terms advise legal counsel on commercial use and are silent on the index API. */
export const commonCrawl = defineProvider({
  name: "Common Crawl",
  url: "https://commoncrawl.org",
  termsUrl: "https://commoncrawl.org/terms-of-use",
  tier: "free",
  commercialUse: "unknown",
});
