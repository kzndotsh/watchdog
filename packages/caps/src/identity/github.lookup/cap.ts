import { Effect } from "effect";

import { optionalCapCredential } from "@watchdog/cap-sdk";
import { fetchGithubUserEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { githubLookupInput } from "./input";
import { interpretGithubLookupReport } from "./interpret";
import { githubUserSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+identity.github.lookup; OSINT)";

export const githubLookup = defineCollectCap({
  id: "identity.github.lookup",
  version: "1",
  title: "GitHub lookup",
  description:
    "Public GitHub user profile for a handle — display name, bio, and account metadata for identity linking.",
  dataSource: "api.github.com",
  input: githubLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "GITHUB_TOKEN", optional: true }],
  consumes: [{ kind: "identifier", type: "handle" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: githubUserSnapshotSchema,
  reportLabel: "github.lookup",
  fetch: (ctx) =>
    Effect.gen(function* githubLookupFetch() {
      const handle = ctx.input.handle.trim();
      ctx.log(`GitHub lookup ${handle}`);
      const token = yield* optionalCapCredential(ctx, "GITHUB_TOKEN");
      const snap = yield* fetchGithubUserEffect(handle, ctx.signal, {
        userAgent: UA,
        token,
      });
      ctx.log(`found=${snap.found} status=${snap.status ?? "?"}`);
      return { snap, artifactName: `github-${snap.handle}.json` };
    }),
  interpretSnap: interpretGithubLookupReport,
});
