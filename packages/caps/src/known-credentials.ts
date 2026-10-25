/** Optional Cap secrets shown in Settings (hard-required names live on CapabilityDef.credentials). */
export type KnownCredential = {
  name: string;
  label: string;
  description: string;
  /**
   * Whether the value is a secret (default true). A secret value read through `getCredential` is
   * found and hidden by value in recorded provider calls; a configuration value such as a base
   * URL is not, so the record names the real destination.
   */
  secret?: boolean;
};

/**
 * Vault slot catalog for Settings.
 *
 * Naming: `WHOIS_API_KEY` is the WhoisXML API key for `network.whoisxml.lookup`
 * (source-axis Cap). `network.whois.lookup` is RDAP-only and does not use this slot.
 *
 * Hygiene: after adding a Cap that declares `credentials`, ensure the name appears
 * here (or Cap-local required credentials alone will fail at run without a Settings row).
 * Run `pnpm generate:caps` after every Cap registration.
 */
export const KNOWN_CREDENTIALS: KnownCredential[] = [
  {
    name: "WHOIS_API_KEY",
    label: "WhoisXML",
    description: "WhoisXML API key for network.whoisxml.lookup.",
  },
  {
    name: "ANTHROPIC_API_KEY",
    label: "Anthropic",
    description: "Anthropic API key.",
  },
  {
    name: "AI_COMPAT_API_KEY",
    label: "OpenAI-compatible",
    description: "API key for OpenAI-compatible providers.",
  },
  {
    name: "AI_COMPAT_BASE_URL",
    label: "OpenAI-compatible URL",
    description: "Base URL for OpenAI-compatible providers.",
    secret: false,
  },
  // Later-wave slots (Caps unnumbered until product surface + Cap ship gates land)
  {
    name: "HIBP_API_KEY",
    label: "Have I Been Pwned",
    description: "HIBP API key for breach.hibp.lookup.",
  },
  {
    name: "GITHUB_TOKEN",
    label: "GitHub",
    description:
      "Optional GitHub token for identity.github.lookup (higher rate limits).",
  },
  {
    name: "SHODAN_API_KEY",
    label: "Shodan",
    description: "Shodan API key for network.shodan.lookup.",
  },
  {
    name: "CENSYS_API_ID",
    label: "Censys API ID",
    description: "Censys Legacy Search API ID (pair with CENSYS_API_SECRET).",
  },
  {
    name: "CENSYS_API_SECRET",
    label: "Censys API secret",
    description: "Censys Legacy Search API secret (pair with CENSYS_API_ID).",
  },
  {
    name: "VIRUSTOTAL_API_KEY",
    label: "VirusTotal",
    description: "VirusTotal API key for threat.virustotal.lookup.",
  },
  {
    name: "ABUSEIPDB_API_KEY",
    label: "AbuseIPDB",
    description: "AbuseIPDB API key for threat.abuseipdb.lookup.",
  },
  {
    name: "WHOXY_API_KEY",
    label: "Whoxy",
    description: "Whoxy API key for network.whoxy.lookup.",
  },
  {
    name: "C99_API_KEY",
    label: "C99",
    description: "C99.nl API key for network.c99.lookup (subdomain finder).",
  },
  {
    name: "THREATFOX_API_KEY",
    label: "abuse.ch Auth-Key",
    description:
      "Free Auth-Key from auth.abuse.ch — shared by threat.threatfox.lookup (malware IOCs, not AbuseIPDB), threat.urlhaus.lookup (malicious URLs/hosts/payloads), threat.malwarebazaar.lookup (file-hash sample metadata), and threat.feodo.lookup (optional; botnet C2 IP blocklist).",
  },
  {
    name: "GREYNOISE_API_KEY",
    label: "GreyNoise Community",
    description:
      "Optional GreyNoise Community API key for threat.greynoise.lookup (free signup).",
  },
  {
    name: "OTX_API_KEY",
    label: "AlienVault OTX",
    description: "AlienVault OTX (LevelBlue) API key for threat.otx.lookup.",
  },
  {
    name: "GOOGLE_SAFEBROWSING_API_KEY",
    label: "Google Safe Browsing",
    description:
      "Google Safe Browsing v4 API key for threat.safebrowsing.lookup.",
  },
  {
    name: "XFORCE_API_KEY",
    label: "IBM X-Force Exchange API key",
    description:
      "IBM X-Force Exchange API key (pair with XFORCE_API_PASSWORD) for threat.xforce.lookup.",
  },
  {
    name: "XFORCE_API_PASSWORD",
    label: "IBM X-Force Exchange API password",
    description:
      "IBM X-Force Exchange API password (pair with XFORCE_API_KEY) for threat.xforce.lookup.",
  },
  {
    name: "HONEYDB_API_ID",
    label: "HoneyDB API ID",
    description:
      "HoneyDB API ID (pair with HONEYDB_API_KEY) for threat.honeydb.lookup.",
  },
  {
    name: "HONEYDB_API_KEY",
    label: "HoneyDB API key",
    description:
      "HoneyDB API key (pair with HONEYDB_API_ID) for threat.honeydb.lookup.",
  },
  {
    name: "LEAKIX_API_KEY",
    label: "LeakIX",
    description: "LeakIX API key for network.leakix.lookup.",
  },
  {
    name: "EMAILREP_API_KEY",
    label: "EmailRep",
    description:
      "EmailRep.io API key for identity.emailrep.lookup (unauthenticated API is disabled).",
  },
  {
    name: "HUDSONROCK_API_KEY",
    label: "Hudson Rock",
    description: "Hudson Rock Cavalier API key for breach.hudsonrock.lookup.",
  },
  {
    name: "URLSCAN_API_KEY",
    label: "urlscan.io",
    description: "urlscan.io API key for network.urlscan.submit (live scans).",
  },
  {
    name: "IPINFO_API_TOKEN",
    label: "IPinfo",
    description: "IPinfo.io API token for network.ipinfo.lookup.",
  },
  {
    name: "DEHASHED_API_KEY",
    label: "DeHashed",
    description: "DeHashed API key for breach.dehashed.lookup.",
  },
  {
    name: "SNUSBASE_API_KEY",
    label: "Snusbase",
    description: "Snusbase API key for breach.snusbase.lookup.",
  },
];

export function listKnownCredentials(): KnownCredential[] {
  return [...KNOWN_CREDENTIALS];
}

/** Whether a vault slot holds a secret: every slot does unless its catalog entry says `secret: false`. */
export function isSecretCredential(name: string): boolean {
  return KNOWN_CREDENTIALS.find((k) => k.name === name)?.secret ?? true;
}
