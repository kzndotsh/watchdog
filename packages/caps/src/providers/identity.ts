import { defineProvider } from "../sdk";

/** emailrep.io/terms answered HTTP 400 and the docs host 429 during research; no terms text was read. */
export const emailrep = defineProvider({
  name: "EmailRep",
  url: "https://emailrep.io",
  termsUrl: "https://emailrep.io",
  tier: "freemium",
  commercialUse: "unknown",
});

/** Neither keyserver states usage or commercial terms. */
export const openpgpKeyservers = defineProvider({
  name: "keys.openpgp.org (Hagrid) / keyserver.ubuntu.com",
  url: "https://keys.openpgp.org",
  termsUrl: "https://keys.openpgp.org/about/usage",
  tier: "free",
  commercialUse: "unknown",
});

/** The Terms of Service ban selling users' personal information and exceeding rate limits through shared tokens; no explicit commercial ban. */
export const github = defineProvider({
  name: "GitHub",
  url: "https://github.com",
  termsUrl:
    "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
  tier: "freemium",
  commercialUse: "restricted",
});

/** The Terms say nothing on API or commercial use. */
export const keybase = defineProvider({
  name: "Keybase",
  url: "https://keybase.io",
  termsUrl: "https://keybase.io/docs/terms",
  tier: "free",
  commercialUse: "unknown",
});

/** The API guidelines say use is free and are silent on commercial use. */
export const gravatar = defineProvider({
  name: "Gravatar (Automattic)",
  url: "https://gravatar.com",
  termsUrl:
    "https://developer.wordpress.com/docs/api/guidelines-for-responsible-use/",
  tier: "free",
  commercialUse: "unknown",
});
