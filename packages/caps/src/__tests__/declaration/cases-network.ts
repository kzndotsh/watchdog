import { HOST, IP, PAGE_URL, type DeclarationCase } from "./case";

/** Network Caps. */
export const NETWORK_CASES: readonly DeclarationCase[] = [
  { id: "network.c99.lookup", inputs: [{ host: HOST }] },
  { id: "network.censys.lookup", inputs: [{ ip: IP }] },
  { id: "network.certspotter.lookup", inputs: [{ host: HOST }] },
  { id: "network.ct.lookup", inputs: [{ host: HOST }] },
  {
    id: "network.dns.lookup",
    inputs: [{ host: HOST }],
    run: { targetHost: HOST },
  },
  {
    id: "network.dns.reverse",
    inputs: [{ ip: IP }],
    run: { targetHost: IP },
  },
  {
    id: "network.domain.mail_config",
    inputs: [{ host: HOST }],
    run: { targetHost: HOST },
  },
  {
    id: "network.domain.txt_inventory",
    inputs: [{ host: HOST }],
    run: { targetHost: HOST },
  },
  { id: "network.hackertarget.lookup", inputs: [{ ip: IP }] },
  {
    id: "network.host.http_probe",
    inputs: [{ host: HOST }],
    run: { targetHost: HOST },
  },
  {
    id: "network.host.tls_audit",
    inputs: [{ host: HOST, port: 8443 }],
    run: { targetHost: HOST },
  },
  { id: "network.ip.lookup", inputs: [{ ip: IP }, { ip: "2001:db8::1" }] },
  { id: "network.ipctl.lookup", inputs: [{ ip: IP }] },
  { id: "network.ipinfo.lookup", inputs: [{ ip: IP }] },
  { id: "network.leakix.lookup", inputs: [{ query: IP }, { query: HOST }] },
  { id: "network.mnemonic.lookup", inputs: [{ query: HOST }] },
  { id: "network.shodan.lookup", inputs: [{ ip: IP }] },
  { id: "network.tor_exit.lookup", inputs: [{ ip: IP }] },
  { id: "network.tranco.lookup", inputs: [{ host: HOST }] },
  {
    id: "network.url.enrich",
    inputs: [{ url: PAGE_URL }],
    run: { targetHost: HOST },
  },
  { id: "network.urlscan.lookup", inputs: [{ host: HOST }] },
  { id: "network.urlscan.submit", inputs: [{ url: PAGE_URL }] },
  {
    id: "network.whois.lookup",
    inputs: [{ host: HOST }],
    respond: (url) =>
      url.hostname === "rdap.org"
        ? new Response(null, {
            status: 302,
            headers: { location: "https://rdap.registry.test/domain/x" },
          })
        : undefined,
  },
  { id: "network.whoisxml.lookup", inputs: [{ host: HOST }] },
  { id: "network.whoxy.lookup", inputs: [{ host: HOST }] },
];
