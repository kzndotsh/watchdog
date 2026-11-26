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
import { interpretSecurityTrailsLookupReport } from "./interpret";

export const securityTrailsLookup = defineCollectCap({
  id: "network.securitytrails.lookup",
  provider: securityTrails,
  title: "SecurityTrails lookup",
  description:
    "Find a domain's subdomains and the IP addresses it has resolved to over time through SecurityTrails. Uses two queries of the account's monthly quota. Past resolutions do not show ownership.",
  dataSource: "api.securitytrails.com/v1",
  input: securityTrailsLookupInput,
  timeoutMs: 60_000,
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
        { userAgent }
      );
      ctx.log(
        `subdomains=${snap.subdomains.length} ipHistory=${snap.ipHistory.length}`
      );
      return { snap, artifactName: `securitytrails-${host}.json` };
    }),
  interpretSnap: interpretSecurityTrailsLookupReport,
  foundSnap: (snap) => [
    ...foundOfType("domain", snap.subdomains, "Subdomain"),
    ...foundOfType(
      "ip",
      snap.ipHistory.map((s) => s.ip),
      "Historical A record"
    ),
  ],
});
