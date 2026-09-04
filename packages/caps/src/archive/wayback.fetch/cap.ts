import { Effect } from "effect";

import {
  closestWaybackTimestampEffect,
  fetchWaybackSnapshotEffect,
  ValidationVendorError,
} from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { waybackFetchInput } from "./input";
import { interpretWaybackFetchReport } from "./interpret";
import { waybackFetchSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+archive.wayback.fetch; OSINT)";

export const waybackFetch = defineCollectCap({
  id: "archive.wayback.fetch",
  version: "1",
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
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: waybackFetchSnapshotSchema,
  reportLabel: "wayback.fetch",
  fetch: (ctx) =>
    Effect.gen(function* waybackFetchFetch() {
      const url = ctx.input.url.trim();
      let timestamp = ctx.input.timestamp?.trim();
      if (!timestamp) {
        ctx.log(`resolving closest CDX for ${url}`);
        timestamp =
          (yield* closestWaybackTimestampEffect(url, ctx.signal, UA)) ??
          undefined;
        if (!timestamp) {
          return yield* new ValidationVendorError({
            message: `No Wayback snapshot found for ${url}`,
          });
        }
      }
      ctx.log(`fetching Wayback ${timestamp} ${url}`);
      const snap = yield* fetchWaybackSnapshotEffect(
        url,
        timestamp,
        ctx.signal,
        {
          userAgent: UA,
        }
      );
      if (!snap.ok) {
        return yield* new ValidationVendorError({
          message: snap.error ?? `Wayback fetch HTTP ${snap.status}`,
        });
      }
      return { snap, artifactName: `wayback-${timestamp}.json` };
    }),
  interpretSnap: interpretWaybackFetchReport,
});
