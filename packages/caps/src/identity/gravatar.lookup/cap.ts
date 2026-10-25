import { Effect } from "effect";

import {
  fetchGravatarLookupEffect,
  gravatarLookupSnapshotSchema,
} from "@watchdog/tools/identity";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { gravatar } from "../../providers";
import { contact } from "../../sdk";
import { gravatarLookupInput } from "./input";
import { interpretGravatarLookupReport } from "./interpret";

export const gravatarLookup = defineCollectCap({
  id: "identity.gravatar.lookup",
  provider: gravatar,
  contacts: [contact.provider("secure.gravatar.com")],
  title: "Gravatar lookup",
  description:
    "Check whether an email address has a public Gravatar profile, and get its avatar and display name if it does.",
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
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* gravatarLookupFetch() {
      const email = ctx.input.email;
      ctx.log(`Gravatar ${email}`);
      const snap = yield* fetchGravatarLookupEffect(email, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found} user=${snap.preferredUsername ?? "?"}`);
      return { snap, artifactName: `gravatar-${snap.hash}.json` };
    }),
  interpretSnap: interpretGravatarLookupReport,
});
