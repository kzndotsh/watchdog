import { Effect } from "effect";

import {
  ValidationVendorError,
  upstreamDiagnostic,
} from "@watchdog/tools/errors";
import {
  closestWaybackTimestampEffect,
  fetchWaybackSnapshotEffect,
  waybackFetchSnapshotSchema,
} from "@watchdog/tools/wayback";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { internetArchive } from "../../providers";
import { waybackFetchInput } from "./input";
import { interpretWaybackFetchReport } from "./interpret";

export const waybackFetch = defineCollectCap({
  id: "archive.wayback.fetch",
  version: "1",
  provider: internetArchive,
  title: "Wayback fetch",
  description:
    "Pull the body of a Wayback snapshot for a URL (closest CDX hit when no timestamp). Use after Wayback history to inspect what the page actually said.",
  dataSource: "web.archive.org",
  input: waybackFetchInput,
  timeoutMs: 90_000,
  kind: "collect",
  useCases: ["Passive"],
  formOmit: ["entityId", "timestamp"],
  consumes: [{ kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: waybackFetchSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* waybackFetchFetch() {
      const url = ctx.input.url;
      let timestamp = ctx.input.timestamp;
      if (!timestamp) {
        ctx.log(`resolving closest CDX for ${url}`);
        timestamp =
          (yield* closestWaybackTimestampEffect(url, ctx.signal, userAgent)) ??
          undefined;
        if (!timestamp) {
          return yield* new ValidationVendorError({
            message: "No Wayback snapshot found",
            cause: "no CDX snapshot found",
          });
        }
      }
      ctx.log(`fetching Wayback ${timestamp} ${url}`);
      const snap = yield* fetchWaybackSnapshotEffect(
        url,
        timestamp,
        ctx.signal,
        {
          userAgent,
        }
      );
      if (!snap.ok) {
        return yield* new ValidationVendorError({
          message: "Wayback fetch failed",
          cause: upstreamDiagnostic(snap.error, snap.status),
        });
      }
      return { snap, artifactName: `wayback-${timestamp}.json` };
    }),
  interpretSnap: interpretWaybackFetchReport,
});
