import { Effect } from "effect";

import {
  fetchGithubUserEffect,
  githubUserSnapshotSchema,
} from "@watchdog/tools/identity";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { optionalCapCredential } from "../../sdk";
import { githubLookupInput } from "./input";
import { interpretGithubLookupReport } from "./interpret";

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
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "GITHUB_TOKEN", optional: true }],
  consumes: [{ kind: "identifier", type: "handle" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "handle" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: githubUserSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* githubLookupFetch() {
      const handle = ctx.input.handle;
      ctx.log(`GitHub lookup ${handle}`);
      const token = yield* optionalCapCredential(ctx, "GITHUB_TOKEN");
      const snap = yield* fetchGithubUserEffect(handle, ctx.signal, {
        userAgent,
        token,
      });
      ctx.log(`found=${snap.found} status=${snap.status ?? "?"}`);
      return { snap, artifactName: `github-${snap.handle}.json` };
    }),
  interpretSnap: interpretGithubLookupReport,
});
