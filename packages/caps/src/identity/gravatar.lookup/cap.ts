import { Effect } from "effect";

import { fetchGravatarLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { gravatarLookupInput } from "./input";
import { interpretGravatarLookupReport } from "./interpret";
import { gravatarLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+identity.gravatar.lookup; OSINT)";

export const gravatarLookup = defineCollectCap({
  id: "identity.gravatar.lookup",
  version: "1",
  title: "Gravatar lookup",
  description:
    "Public Gravatar profile for an email (MD5 hash). Confirms a published avatar/profile exists; may surface a display-name handle.",
  dataSource: "secure.gravatar.com",
  input: gravatarLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "identifier", type: "email" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "email" },
    { kind: "identifier", type: "handle" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: gravatarLookupSnapshotSchema,
  reportLabel: "gravatar.lookup",
  fetch: (ctx) =>
    Effect.gen(function* gravatarLookupFetch() {
      const email = ctx.input.email.trim();
      ctx.log(`Gravatar ${email}`);
      const snap = yield* fetchGravatarLookupEffect(email, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found} user=${snap.preferredUsername ?? "?"}`);
      return { snap, artifactName: `gravatar-${snap.hash}.json` };
    }),
  interpretSnap: interpretGravatarLookupReport,
});
