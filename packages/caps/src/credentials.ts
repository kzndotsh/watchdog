import type { CredentialSlotMeta } from "./sdk";

/**
 * Vault slots shared by more than one Cap, stated once here. A slot only one Cap reads is
 * declared inline on that Cap's `credentials`; both end up in Settings' catalog
 * (`listKnownCredentials`).
 */

/** The abuse.ch Auth-Key: one slot for every abuse.ch Cap. */
export const abuseChAuthKey: CredentialSlotMeta = {
  name: "THREATFOX_API_KEY",
  label: "abuse.ch Auth-Key",
  description:
    "Free Auth-Key from auth.abuse.ch — shared by threat.threatfox.lookup (malware IOCs, not AbuseIPDB), threat.urlhaus.lookup (malicious URLs/hosts/payloads), threat.malwarebazaar.lookup (file-hash sample metadata), and threat.feodo.lookup (optional; botnet C2 IP blocklist).",
};
