import { defineProvider } from "../sdk";

const REPO_URL = "https://github.com/kzndotsh/watchdog";
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/** Queries go to the resolver the host already uses: no Watchdog-chosen third party. */
export const systemResolver = defineProvider({
  name: "This server's DNS resolver",
  url: REPO_URL,
  termsUrl: LICENSE_URL,
  tier: "self",
  commercialUse: "allowed",
});

/** The Cap talks to the investigated host itself (probe, handshake, redirects, page fetch). */
export const targetHost = defineProvider({
  name: "The target itself",
  url: REPO_URL,
  termsUrl: LICENSE_URL,
  tier: "self",
  commercialUse: "allowed",
});

/** Deterministic analysis of Evidence the Case already holds: nothing leaves the host. */
export const localAnalysis = defineProvider({
  name: "This server",
  url: REPO_URL,
  termsUrl: LICENSE_URL,
  tier: "self",
  commercialUse: "allowed",
});
