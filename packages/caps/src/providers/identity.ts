import { PGP_KEYSERVERS } from "@watchdog/tools/identity";

import { defineProvider } from "../sdk";

/** emailrep.io/terms answered HTTP 400 and the docs host 429 during research; no terms text was read. */
export const emailrep = defineProvider({
  name: "EmailRep",
  url: "https://emailrep.io",
  termsUrl: "https://emailrep.io",
  tier: "freemium",
  commercialUse: "unknown",
  hosts: {
    "emailrep.io": "unknown",
  },
});

/**
 * None of the keyservers states usage or commercial terms (keys.openpgp.org's usage page only
 * sets rate limits; the Mailvelope README only lists what its API accepts), so every verdict is
 * an unannotated `unknown`. The hosts come from `PGP_KEYSERVERS`, the one list the tool, the
 * Cap's contacts and this block read, so a new keyserver is one entry there.
 */
export const openpgpKeyservers = defineProvider({
  name: "PGP keyservers",
  url: "https://keys.openpgp.org",
  termsUrl: "https://keys.openpgp.org/about/usage",
  tier: "free",
  commercialUse: "unknown",
  hosts: Object.fromEntries(
    PGP_KEYSERVERS.map((server) => [server.host, "unknown"] as const)
  ),
});

/** The Terms of Service ban selling users' personal information and exceeding rate limits through shared tokens; no explicit commercial ban. */
export const github = defineProvider({
  name: "GitHub",
  url: "https://github.com",
  termsUrl:
    "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
  tier: "freemium",
  commercialUse: "restricted",
  hosts: {
    // GitHub ToS H and AUP bar only spam and selling users' personal information.
    "api.github.com": "allowed",
  },
});

/** The Terms say nothing on API or commercial use. */
export const keybase = defineProvider({
  name: "Keybase",
  url: "https://keybase.io",
  termsUrl: "https://keybase.io/docs/terms",
  tier: "free",
  commercialUse: "unknown",
  hosts: {
    "keybase.io": "unknown",
  },
});

/** The API guidelines say use is free and are silent on commercial use. */
export const gravatar = defineProvider({
  name: "Gravatar",
  url: "https://gravatar.com",
  termsUrl:
    "https://developer.wordpress.com/docs/api/guidelines-for-responsible-use/",
  tier: "free",
  commercialUse: "unknown",
  hosts: {
    "secure.gravatar.com": "unknown",
  },
});
