import { HOST, IP, MD5, PAGE_URL, SHA256, type DeclarationCase } from "./case";

/** Threat and web Caps. */
export const THREAT_CASES: readonly DeclarationCase[] = [
  { id: "threat.abuseipdb.lookup", inputs: [{ ip: IP }] },
  { id: "threat.bgpranking.lookup", inputs: [{ ip: IP }] },
  { id: "threat.cymru_mhr.lookup", inputs: [{ hash: SHA256 }] },
  { id: "threat.dshield.lookup", inputs: [{ ip: IP }] },
  { id: "threat.feodo.lookup", inputs: [{ ip: IP }] },
  { id: "threat.firehol.lookup", inputs: [{ ip: IP }] },
  { id: "threat.greedybear.lookup", inputs: [{ query: IP }] },
  { id: "threat.greynoise.lookup", inputs: [{ ip: IP }] },
  { id: "threat.hashlookup.lookup", inputs: [{ hash: SHA256 }] },
  { id: "threat.honeydb.lookup", inputs: [{ ip: IP }] },
  { id: "threat.malwarebazaar.lookup", inputs: [{ hash: MD5 }] },
  { id: "threat.otx.lookup", inputs: [{ query: IP }] },
  { id: "threat.safebrowsing.lookup", inputs: [{ url: PAGE_URL }] },
  { id: "threat.threatfox.lookup", inputs: [{ query: IP }] },
  { id: "threat.urlhaus.lookup", inputs: [{ query: PAGE_URL }] },
  { id: "threat.virustotal.lookup", inputs: [{ query: HOST }] },
  { id: "threat.xforce.lookup", inputs: [{ query: IP }] },
  {
    id: "web.media.oembed",
    inputs: [
      { url: "https://www.youtube.com/watch?v=abc123" },
      { url: "https://vimeo.com/12345" },
      { url: "https://www.flickr.com/photos/ada/1" },
      { url: "https://soundcloud.com/ada/track" },
      { url: "https://www.tiktok.com/@ada/video/1" },
      { url: "https://open.spotify.com/track/abc" },
    ],
  },
  {
    id: "web.page.enrich",
    inputs: [{ url: PAGE_URL }],
    run: { targetHost: HOST },
  },
  {
    id: "web.url.unshorten",
    inputs: [{ url: "https://mailhost.test/short" }],
    // One call per redirect hop, so each hop's host is the first host of its own call.
    run: { targetHost: HOST },
    respond: (url) =>
      url.pathname === "/short"
        ? new Response(null, {
            status: 301,
            headers: { location: "https://elsewhere.test/long" },
          })
        : undefined,
  },
];
