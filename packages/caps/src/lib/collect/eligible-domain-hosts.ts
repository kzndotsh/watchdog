import { normalizeHost } from "@watchdog/tools";

/** Hostnames safe for handoff bags and domain Identifier proposals (CT, SAN, subdomains). */
export function eligibleCtDomains(domains: readonly string[]): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];
  for (const raw of domains) {
    const host = normalizeHost(raw);
    if (host === "" || host.startsWith("*.") || host.includes("*")) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    hosts.push(host);
  }
  return hosts;
}

/** Prepend the queried host so host-consuming caps always propose the seed domain. */
export function withSeedHost(
  host: string,
  domains: readonly string[]
): string[] {
  const seed = normalizeHost(host);
  if (seed === "") return eligibleCtDomains(domains);
  return eligibleCtDomains([seed, ...domains]);
}
