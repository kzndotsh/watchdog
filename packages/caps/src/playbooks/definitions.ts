import type { PlaybookDef } from "./plan";

export const hostFootprint: PlaybookDef = {
  id: "host-footprint",
  title: "Domain footprint",
  description:
    "Map a domain's DNS records, WHOIS registration, mail setup and the hostnames in public certificate logs, one step after another.",
  seedKinds: ["host"],
  steps: [
    "network.dns.lookup",
    "network.whois.lookup",
    "network.domain.mail_config",
    "network.ct.lookup",
    "network.certspotter.lookup",
  ],
};

export const hostPosture: PlaybookDef = {
  id: "host-posture",
  title: "Host security setup",
  description:
    "Check a host's TLS certificate, then its web security headers. Both steps connect to the target directly.",
  seedKinds: ["host"],
  steps: ["network.host.tls_audit", "network.host.http_probe"],
};

export const hostReputation: PlaybookDef = {
  id: "host-reputation",
  title: "Domain reputation",
  description:
    "Search past urlscan.io scans of a domain and look up its Tranco popularity rank.",
  seedKinds: ["host"],
  steps: ["network.urlscan.lookup", "network.tranco.lookup"],
};

export const urlCapture: PlaybookDef = {
  id: "url-capture",
  title: "Capture a URL and pull identifiers",
  description:
    "Fetch the page of a held URL dump and its Wayback history, then pull email addresses, domains and other identifiers out of the URL dump itself.",
  seedKinds: ["url", "evidence"],
  steps: ["network.url.enrich", "evidence.harvest"],
};

export const urlCaptureAi: PlaybookDef = {
  id: "url-capture-ai",
  title: "Capture a URL and extract with AI",
  description:
    "Fetch the page of a held URL dump and its Wayback history, then use AI to pull identifiers, claims and open questions out of the URL dump itself.",
  seedKinds: ["url", "evidence"],
  steps: ["network.url.enrich", "evidence.extract.ai"],
};

export const urlHistory: PlaybookDef = {
  id: "url-history",
  title: "URL archive history",
  description:
    "List when the Wayback Machine captured a URL, then search Common Crawl for other pages on its domain. Lists captures without fetching them.",
  seedKinds: ["url"],
  steps: [
    { capabilityId: "archive.wayback.lookup", input: { limit: 25 } },
    "archive.commoncrawl.lookup",
  ],
};

export const urlReputation: PlaybookDef = {
  id: "url-reputation",
  title: "URL check",
  description:
    "Find past urlscan.io scans of the URL's domain and follow any short-link redirects to the real destination.",
  seedKinds: ["url"],
  steps: ["network.urlscan.lookup", "web.url.unshorten"],
};

export const urlReputationPlus: PlaybookDef = {
  id: "url-reputation-plus",
  title: "URL threat lists",
  description:
    "Check a URL against URLhaus and Google Safe Browsing for malware and phishing.",
  seedKinds: ["url"],
  steps: ["threat.urlhaus.lookup", "threat.safebrowsing.lookup"],
};

export const ipContext: PlaybookDef = {
  id: "ip-context",
  title: "IP context",
  description:
    "Find the network and registration country behind an IP address, its routing details, and the hostnames it points back to.",
  seedKinds: ["ip"],
  steps: ["network.ip.lookup", "network.ipctl.lookup", "network.dns.reverse"],
};

export const ipReputation: PlaybookDef = {
  id: "ip-reputation",
  title: "IP blocklists",
  description:
    "Check an IP address against the DShield and FireHOL blocklists.",
  seedKinds: ["ip"],
  steps: ["threat.dshield.lookup", "threat.firehol.lookup"],
};

export const ipExposure: PlaybookDef = {
  id: "ip-exposure",
  title: "IP exposure",
  description:
    "See what Shodan, Censys and LeakIX have found exposed on an IP address: open services, certificates and leaks.",
  seedKinds: ["ip"],
  steps: [
    "network.shodan.lookup",
    "network.censys.lookup",
    "network.leakix.lookup",
  ],
};

export const ipNoise: PlaybookDef = {
  id: "ip-noise",
  title: "IP background noise",
  description:
    "Check whether an IP address is a Tor exit node or a known internet scanner, to tell routine noise from targeted traffic.",
  seedKinds: ["ip"],
  steps: ["network.tor_exit.lookup", "threat.greynoise.lookup"],
};

export const emailIdentity: PlaybookDef = {
  id: "email-identity",
  title: "Email identity",
  description:
    "Check an email address's mail setup, Gravatar profile and published PGP keys. Shows what is public about the address, not who owns it.",
  seedKinds: ["email"],
  steps: [
    "identity.email.lookup",
    "identity.gravatar.lookup",
    "identity.pgp.lookup",
  ],
};

export const emailIdentityPlus: PlaybookDef = {
  id: "email-identity-plus",
  title: "Email identity, extended",
  description: "The Email identity steps plus an EmailRep reputation check.",
  seedKinds: ["email"],
  steps: [
    "identity.email.lookup",
    "identity.gravatar.lookup",
    "identity.emailrep.lookup",
    "identity.pgp.lookup",
  ],
};

export const emailBreach: PlaybookDef = {
  id: "email-breach",
  title: "Email breaches",
  description:
    "Check Have I Been Pwned and Hudson Rock for breaches and infostealer infections tied to an email address. Returns counts and dates, never passwords.",
  seedKinds: ["email"],
  steps: ["breach.hibp.lookup", "breach.hudsonrock.lookup"],
};

export const emailCorpus: PlaybookDef = {
  id: "email-corpus",
  title: "Email breach records",
  description:
    "Search DeHashed's and Snusbase's breach data for an email address. Results can include passwords, so this is kept apart from Email breaches.",
  seedKinds: ["email"],
  steps: ["breach.dehashed.lookup", "breach.snusbase.lookup"],
};

export const hashMalware: PlaybookDef = {
  id: "hash-malware",
  title: "File hash check",
  description:
    "Check a file hash against CIRCL's library of known software and Team Cymru's malware registry.",
  seedKinds: ["hash"],
  steps: ["threat.hashlookup.lookup", "threat.cymru_mhr.lookup"],
};

export const hashMalwarePlus: PlaybookDef = {
  id: "hash-malware-plus",
  title: "File hash check, extended",
  description: "Check a file hash against CIRCL, MalwareBazaar and Team Cymru.",
  seedKinds: ["hash"],
  steps: [
    "threat.hashlookup.lookup",
    "threat.malwarebazaar.lookup",
    "threat.cymru_mhr.lookup",
  ],
};

export const handlePresence: PlaybookDef = {
  id: "handle-presence",
  title: "Username presence",
  description:
    "Look up a username on GitHub and Keybase. Two sites, not a sweep across hundreds.",
  seedKinds: ["handle"],
  steps: ["identity.github.lookup", "identity.keybase.lookup"],
};

export const hostContacts: PlaybookDef = {
  id: "host-contacts",
  title: "Domain contacts",
  description:
    "Get a domain's WHOIS record, then pull email addresses and other contacts out of it. Privacy-protected records often give only the registrar's abuse address.",
  seedKinds: ["host"],
  steps: [
    "network.whois.lookup",
    {
      capabilityId: "evidence.harvest",
      bind: { evidenceId: { step: 0, bag: "evidenceId" } },
    },
  ],
};

export const urlResolve: PlaybookDef = {
  id: "url-resolve",
  title: "Resolve a short link",
  description:
    "Follow a short link to its real destination, then record that page's title, tags and tracking scripts.",
  seedKinds: ["url"],
  steps: [
    "web.url.unshorten",
    {
      capabilityId: "web.page.enrich",
      bind: { url: { step: 0, bag: "url" } },
    },
  ],
};

export const evidenceFile: PlaybookDef = {
  id: "evidence-file",
  title: "Analyze a file",
  description:
    "Inspect a file held as Evidence, then check its hash against CIRCL's library of known software.",
  seedKinds: ["evidence"],
  steps: [
    "evidence.file.analyze",
    {
      capabilityId: "threat.hashlookup.lookup",
      bind: { hash: { step: 0, bag: "hash" } },
    },
  ],
};

export const hostEnumerate: PlaybookDef = {
  id: "host-enumerate",
  title: "Find subdomains",
  description:
    "Find a domain's subdomains in public certificate logs, then look up DNS for each one, up to 25.",
  seedKinds: ["host"],
  steps: [
    "network.ct.lookup",
    {
      capabilityId: "network.dns.lookup",
      fanOut: { from: { step: 0, bag: "host" }, to: "host", max: 25 },
    },
  ],
};
