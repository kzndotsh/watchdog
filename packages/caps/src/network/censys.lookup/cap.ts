import { Effect } from "effect";

import {
  fetchCensysHostEffect,
  censysLookupSnapshotSchema,
} from "@watchdog/tools/network";
import { normalizeIp } from "@watchdog/tools/normalize";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { censys } from "../../providers";
import { contact } from "../../sdk";
import { censysLookupInput } from "./input";
import { interpretCensysLookupReport } from "./interpret";

export const censysLookup = defineCollectCap({
  id: "network.censys.lookup",
  provider: censys,
  title: "Censys lookup",
  description:
    "See what Censys's internet-wide scans found on an IP address: services, certificates and location. A different scan source from Shodan.",
  dataSource: "search.censys.io Legacy Search API v2",
  input: censysLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [contact.provider("search.censys.io", { keyed: true })],
  credentials: [
    {
      slot: {
        name: "CENSYS_API_ID",
        label: "Censys API ID",
        description:
          "Censys Legacy Search API ID (pair with CENSYS_API_SECRET).",
      },
    },
    {
      slot: {
        name: "CENSYS_API_SECRET",
        label: "Censys API secret",
        description:
          "Censys Legacy Search API secret (pair with CENSYS_API_ID).",
      },
    },
  ],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: censysLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* censysLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`Censys ${ip}`);
      const apiId = yield* ctx.getCredential("CENSYS_API_ID");
      const apiSecret = yield* ctx.getCredential("CENSYS_API_SECRET");
      const snap = yield* fetchCensysHostEffect(
        ip,
        apiId,
        apiSecret,
        ctx.signal,
        { userAgent }
      );
      ctx.log(
        `found=${snap.found} ports=${snap.ports.length} services=${snap.serviceNames.length}`
      );
      return { snap, artifactName: `censys-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretCensysLookupReport,
});
