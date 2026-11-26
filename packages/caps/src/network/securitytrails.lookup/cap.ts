import { Effect } from "effect";

import {
  fetchSecurityTrailsLookupEffect,
  securityTrailsLookupSnapshotSchema,
} from "#tools/network";
import { normalizeHost } from "#tools/normalize";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { foundOfType } from "../../lib/collect/found-values";
import { securityTrails } from "../../providers";
import { contact } from "../../sdk";
import { securityTrailsLookupInput } from "./input";
import {
  historicalIps,
  interpretSecurityTrailsLookupReport,
} from "./interpret";

export const securityTrailsLookup = defineCollectCap({
  id: "network.securitytrails.lookup",
  provider: securityTrails,
  title: "SecurityTrails lookup",
  description:
    "Find a domain's subdomains and its DNS history (A by default; AAAA, MX, NS, SOA or TXT on request) through SecurityTrails. Uses one query of the account's monthly quota for the subdomains plus one per record type. Past records do not show ownership.",
  dataSource: "api.securitytrails.com/v1",
  input: securityTrailsLookupInput,
  /** Up to seven sequential requests (subdomains plus six record types) at 30 s each, with headroom. */
  timeoutMs: 240_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [contact.provider("api.securitytrails.com", { keyed: true })],
  credentials: [
    {
      slot: {
        name: "SECURITYTRAILS_API_KEY",
        label: "SecurityTrails",
        description:
          "SecurityTrails API key for network.securitytrails.lookup (subdomains and DNS history).",
      },
    },
  ],
  consumes: [{ kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "domain" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 6 * 60 * 60_000,
  },
  schema: securityTrailsLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* securityTrailsLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`SecurityTrails ${host}`);
      const key = yield* ctx.getCredential("SECURITYTRAILS_API_KEY");
      const snap = yield* fetchSecurityTrailsLookupEffect(
        host,
        key,
        ctx.signal,
        {
          userAgent,
          recordTypes: ctx.input.recordTypes,
        }
      );
      const history = snap.dnsHistory
        .map((h) => `${h.type}=${h.records.length}`)
        .join(" ");
      ctx.log(`subdomains=${snap.subdomains.length} ${history}`);
      return { snap, artifactName: `securitytrails-${host}.json` };
    }),
  interpretSnap: interpretSecurityTrailsLookupReport,
  foundSnap: (snap) => [
    ...foundOfType("domain", snap.subdomains, "Subdomain"),
    ...foundOfType(
      "ip",
      historicalIps(snap.dnsHistory),
      "Historical A/AAAA record"
    ),
  ],
});
