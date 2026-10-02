import type { z } from "zod";

import { commoncrawlLookup } from "./archive/commoncrawl.lookup/cap";
import { urlSubmit } from "./archive/url.submit/cap";
import { waybackFetch } from "./archive/wayback.fetch/cap";
import { waybackLookup } from "./archive/wayback.lookup/cap";
import { dehashedLookup } from "./breach/dehashed.lookup/cap";
import { hibpLookup } from "./breach/hibp.lookup/cap";
import { hudsonrockLookup } from "./breach/hudsonrock.lookup/cap";
import { snusbaseLookup } from "./breach/snusbase.lookup/cap";
import { emlAnalyze } from "./evidence/eml.analyze/cap";
import { extractAi } from "./evidence/extract.ai/cap";
import { fileAnalyze } from "./evidence/file.analyze/cap";
import { harvest } from "./evidence/harvest/cap";
import { emailLookup } from "./identity/email.lookup/cap";
import { emailrepLookup } from "./identity/emailrep.lookup/cap";
import { githubLookup } from "./identity/github.lookup/cap";
import { gravatarLookup } from "./identity/gravatar.lookup/cap";
import { keybaseLookup } from "./identity/keybase.lookup/cap";
import { pgpLookup } from "./identity/pgp.lookup/cap";
import { c99Lookup } from "./network/c99.lookup/cap";
import { censysLookup } from "./network/censys.lookup/cap";
import { certspotterLookup } from "./network/certspotter.lookup/cap";
import { ctLookup } from "./network/ct.lookup/cap";
import { dnsLookup } from "./network/dns.lookup/cap";
import { dnsReverse } from "./network/dns.reverse/cap";
import { mailConfig } from "./network/domain.mail_config/cap";
import { txtInventory } from "./network/domain.txt_inventory/cap";
import { hackertargetLookup } from "./network/hackertarget.lookup/cap";
import { httpProbe } from "./network/host.http_probe/cap";
import { tlsAudit } from "./network/host.tls_audit/cap";
import { ipLookup } from "./network/ip.lookup/cap";
import { ipctlLookup } from "./network/ipctl.lookup/cap";
import { ipinfoLookup } from "./network/ipinfo.lookup/cap";
import { leakixLookup } from "./network/leakix.lookup/cap";
import { mnemonicLookup } from "./network/mnemonic.lookup/cap";
import { shodanLookup } from "./network/shodan.lookup/cap";
import { torExitLookup } from "./network/tor_exit.lookup/cap";
import { trancoLookup } from "./network/tranco.lookup/cap";
import { urlEnrich } from "./network/url.enrich/cap";
import { urlscanLookup } from "./network/urlscan.lookup/cap";
import { urlscanSubmit } from "./network/urlscan.submit/cap";
import { whoisLookup } from "./network/whois.lookup/cap";
import { whoisXmlLookup } from "./network/whoisxml.lookup/cap";
import { whoxyLookup } from "./network/whoxy.lookup/cap";
import {
  capTimeoutMs,
  toCapDescriptor,
  type CapDescriptor,
  type CapabilityDef,
} from "./sdk";
import { abuseIpdbLookup } from "./threat/abuseipdb.lookup/cap";
import { bgprankingLookup } from "./threat/bgpranking.lookup/cap";
import { cymruMhrLookup } from "./threat/cymru_mhr.lookup/cap";
import { dshieldLookup } from "./threat/dshield.lookup/cap";
import { feodoLookup } from "./threat/feodo.lookup/cap";
import { fireholLookup } from "./threat/firehol.lookup/cap";
import { greedybearLookup } from "./threat/greedybear.lookup/cap";
import { greynoiseLookup } from "./threat/greynoise.lookup/cap";
import { hashlookupLookup } from "./threat/hashlookup.lookup/cap";
import { honeydbLookup } from "./threat/honeydb.lookup/cap";
import { malwarebazaarLookup } from "./threat/malwarebazaar.lookup/cap";
import { otxLookup } from "./threat/otx.lookup/cap";
import { safebrowsingLookup } from "./threat/safebrowsing.lookup/cap";
import { threatfoxLookup } from "./threat/threatfox.lookup/cap";
import { urlhausLookup } from "./threat/urlhaus.lookup/cap";
import { virusTotalLookup } from "./threat/virustotal.lookup/cap";
import { xforceLookup } from "./threat/xforce.lookup/cap";
import { mediaOembed } from "./web/media.oembed/cap";
import { pageEnrich } from "./web/page.enrich/cap";
import { urlUnshorten } from "./web/url.unshorten/cap";

/** Cap SoT — register here only (no duplicate named re-exports). */
export const CAPABILITIES: CapabilityDef<z.ZodType>[] = [
  dnsLookup,
  dnsReverse,
  ipLookup,
  ipctlLookup,
  ipinfoLookup,
  whoisLookup,
  whoisXmlLookup,
  whoxyLookup,
  ctLookup,
  certspotterLookup,
  c99Lookup,
  hackertargetLookup,
  mnemonicLookup,
  urlscanLookup,
  urlscanSubmit,
  mailConfig,
  txtInventory,
  tlsAudit,
  httpProbe,
  shodanLookup,
  censysLookup,
  leakixLookup,
  torExitLookup,
  trancoLookup,
  urlEnrich,
  waybackLookup,
  waybackFetch,
  urlSubmit,
  commoncrawlLookup,
  urlUnshorten,
  pageEnrich,
  mediaOembed,
  emailLookup,
  emailrepLookup,
  pgpLookup,
  githubLookup,
  keybaseLookup,
  gravatarLookup,
  hibpLookup,
  hudsonrockLookup,
  dehashedLookup,
  snusbaseLookup,
  virusTotalLookup,
  abuseIpdbLookup,
  threatfoxLookup,
  urlhausLookup,
  malwarebazaarLookup,
  feodoLookup,
  greynoiseLookup,
  hashlookupLookup,
  bgprankingLookup,
  dshieldLookup,
  cymruMhrLookup,
  fireholLookup,
  otxLookup,
  safebrowsingLookup,
  xforceLookup,
  greedybearLookup,
  honeydbLookup,
  harvest,
  extractAi,
  fileAnalyze,
  emlAnalyze,
];

export function requireCapability(id: string) {
  const found = CAPABILITIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown Capability: ${id}`);
  return found;
}

/** Serializable Cap catalog for Jobs UI / CLI / agents. */
export function listCapabilities(): CapDescriptor[] {
  return CAPABILITIES.map((c) => toCapDescriptor(c));
}

/** Slowest registered Cap abort window — drives graceful stop / queue expire ceiling. */
export function capTimeoutCeilingMs(): number {
  return Math.max(...CAPABILITIES.map(capTimeoutMs));
}
