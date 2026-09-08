import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { fetchDehashedLookupEffect } from "../../breach/dehashed";
import { fetchHudsonrockLookupEffect } from "../../breach/hudsonrock";
import { fetchSnusbaseLookupEffect } from "../../breach/snusbase";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchEmailrepLookupEffect } from "../../identity/emailrep";
import { fetchHibpBreachedAccountEffect } from "../../identity/hibp";
import { fetchC99SubdomainsEffect } from "../../network/c99";
import { fetchCensysHostEffect } from "../../network/censys";
import { fetchIpinfoLookupEffect } from "../../network/ipinfo";
import { fetchLeakixLookupEffect } from "../../network/leakix";
import { fetchShodanHostEffect } from "../../network/shodan";
import { submitUrlscanEffect } from "../../network/urlscan-submit";
import { fetchWhoxyWhoisEffect } from "../../network/whoxy";
import { fetchAbuseIpdbCheckEffect } from "../../threat/abuseipdb";
import { fetchOtxLookupEffect } from "../../threat/otx";
import { fetchSafebrowsingLookupEffect } from "../../threat/safebrowsing";
import { fetchThreatfoxLookupEffect } from "../../threat/threatfox";
import { fetchVirusTotalLookupEffect } from "../../threat/virustotal";
import { fetchXforceLookupEffect } from "../../threat/xforce";
import { MissingCredentialError } from "../tagged-errors";

const signal = () => AbortSignal.timeout(5000);

const guardCases = [
  {
    name: "safebrowsing",
    slot: "GOOGLE_SAFEBROWSING_API_KEY",
    run: () =>
      fetchSafebrowsingLookupEffect("https://example.com", "", signal()).pipe(
        Effect.flip
      ),
  },
  {
    name: "otx",
    slot: "OTX_API_KEY",
    run: () => fetchOtxLookupEffect("8.8.8.8", "", signal()).pipe(Effect.flip),
  },
  {
    name: "abuseipdb",
    slot: "ABUSEIPDB_API_KEY",
    run: () =>
      fetchAbuseIpdbCheckEffect("8.8.8.8", "", signal()).pipe(Effect.flip),
  },
  {
    name: "shodan",
    slot: "SHODAN_API_KEY",
    run: () => fetchShodanHostEffect("8.8.8.8", "", signal()).pipe(Effect.flip),
  },
  {
    name: "leakix",
    slot: "LEAKIX_API_KEY",
    run: () =>
      fetchLeakixLookupEffect("8.8.8.8", "", signal()).pipe(Effect.flip),
  },
  {
    name: "virustotal",
    slot: "VIRUSTOTAL_API_KEY",
    run: () =>
      fetchVirusTotalLookupEffect("8.8.8.8", "", signal()).pipe(Effect.flip),
  },
  {
    name: "censys api id",
    slot: "CENSYS_API_ID",
    run: () =>
      fetchCensysHostEffect("8.8.8.8", "", "secret", signal()).pipe(
        Effect.flip
      ),
  },
  {
    name: "censys api secret",
    slot: "CENSYS_API_SECRET",
    run: () =>
      fetchCensysHostEffect("8.8.8.8", "id", "", signal()).pipe(Effect.flip),
  },
  {
    name: "ipinfo",
    slot: "IPINFO_API_TOKEN",
    run: () =>
      fetchIpinfoLookupEffect("8.8.8.8", "", signal()).pipe(Effect.flip),
  },
  {
    name: "threatfox",
    slot: "THREATFOX_API_KEY",
    run: () =>
      fetchThreatfoxLookupEffect("8.8.8.8", "", signal()).pipe(Effect.flip),
  },
  {
    name: "urlscan submit",
    slot: "URLSCAN_API_KEY",
    run: () =>
      submitUrlscanEffect("https://example.com", "", "public", signal()).pipe(
        Effect.flip
      ),
  },
  {
    name: "dehashed",
    slot: "DEHASHED_API_KEY",
    run: () =>
      fetchDehashedLookupEffect("ada@example.com", "", signal()).pipe(
        Effect.flip
      ),
  },
  {
    name: "hudsonrock",
    slot: "HUDSONROCK_API_KEY",
    run: () =>
      fetchHudsonrockLookupEffect("ada@example.com", "", signal()).pipe(
        Effect.flip
      ),
  },
  {
    name: "snusbase",
    slot: "SNUSBASE_API_KEY",
    run: () =>
      fetchSnusbaseLookupEffect("ada@example.com", "", signal()).pipe(
        Effect.flip
      ),
  },
  {
    name: "emailrep",
    slot: "EMAILREP_API_KEY",
    run: () =>
      fetchEmailrepLookupEffect("ada@example.com", signal()).pipe(Effect.flip),
  },
  {
    name: "hibp",
    slot: "HIBP_API_KEY",
    run: () =>
      fetchHibpBreachedAccountEffect("ada@example.com", "", signal()).pipe(
        Effect.flip
      ),
  },
  {
    name: "whoxy",
    slot: "WHOXY_API_KEY",
    run: () =>
      fetchWhoxyWhoisEffect("example.com", "", signal()).pipe(Effect.flip),
  },
  {
    name: "c99",
    slot: "C99_API_KEY",
    run: () =>
      fetchC99SubdomainsEffect("example.com", "", signal()).pipe(Effect.flip),
  },
  {
    name: "xforce api key",
    slot: "XFORCE_API_KEY",
    run: () =>
      fetchXforceLookupEffect("8.8.8.8", "", "password", signal()).pipe(
        Effect.flip
      ),
  },
  {
    name: "xforce api password",
    slot: "XFORCE_API_PASSWORD",
    run: () =>
      fetchXforceLookupEffect("8.8.8.8", "key", "", signal()).pipe(Effect.flip),
  },
];

describe("credential guards", () => {
  for (const { name, slot, run } of guardCases) {
    it.effect(`${name} requires ${slot}`, () =>
      Effect.gen(function* missingKeyGen() {
        const result = yield* run();
        expect(result).toBeInstanceOf(MissingCredentialError);
        expect(result.slot).toBe(slot);
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );
  }
});
