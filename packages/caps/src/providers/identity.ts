import { defineProvider, type CapProvider } from "../sdk";

/** emailrep.io/terms answered HTTP 400 and the docs host 429 during research; no terms text was read. */
export const emailrep = defineProvider({
  name: "EmailRep",
  url: "https://emailrep.io",
  termsUrl: "https://emailrep.io",
  tier: "freemium",
  commercialUse: "unknown",
});

/** The usage page sets rate limits and says nothing on commercial use. */
const keysOpenpgpOrg = defineProvider({
  name: "keys.openpgp.org",
  url: "https://keys.openpgp.org",
  termsUrl: "https://keys.openpgp.org/about/usage",
  tier: "free",
  commercialUse: "unknown",
});

/** The keyserver states no usage or commercial terms. */
const keyserverUbuntuCom = defineProvider({
  name: "Ubuntu keyserver",
  url: "https://keyserver.ubuntu.com",
  termsUrl: "https://keyserver.ubuntu.com",
  tier: "free",
  commercialUse: "unknown",
});

/** The keyserver states no usage or commercial terms. */
const pgpMitEdu = defineProvider({
  name: "MIT PGP key server",
  url: "https://pgp.mit.edu",
  termsUrl: "https://pgp.mit.edu",
  tier: "free",
  commercialUse: "unknown",
});

/** The server states no usage or commercial terms; its README only lists what the API accepts. */
const keysMailvelopeCom = defineProvider({
  name: "Mailvelope keyserver",
  url: "https://keys.mailvelope.com",
  termsUrl: "https://keys.mailvelope.com",
  tier: "free",
  commercialUse: "unknown",
});

/** The keyserver states no usage or commercial terms. */
const pgpkeysEu = defineProvider({
  name: "pgpkeys.eu",
  url: "https://pgpkeys.eu",
  termsUrl: "https://pgpkeys.eu",
  tier: "free",
  commercialUse: "unknown",
});

/** The provider of each keyserver `identity.pgp.lookup` asks, by host. */
export const pgpKeyserverProviders: Readonly<Record<string, CapProvider>> = {
  "keyserver.ubuntu.com": keyserverUbuntuCom,
  "keys.openpgp.org": keysOpenpgpOrg,
  "pgp.mit.edu": pgpMitEdu,
  "keys.mailvelope.com": keysMailvelopeCom,
  "pgpkeys.eu": pgpkeysEu,
};

/** None of the five keyservers states usage or commercial terms; the Cap's own entry names the group. */
export const openpgpKeyservers = defineProvider({
  name: "PGP keyservers",
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
  name: "Gravatar",
  url: "https://gravatar.com",
  termsUrl:
    "https://developer.wordpress.com/docs/api/guidelines-for-responsible-use/",
  tier: "free",
  commercialUse: "unknown",
});
