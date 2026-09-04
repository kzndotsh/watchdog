import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchGithubUserEffect,
  githubUserSnapshotSchema,
  normalizeGithubHandle,
} from "../github-user";

describe("github-user", () => {
  it("normalizeGithubHandle strips @ and validates login", () => {
    expect(normalizeGithubHandle("@OctoCat")).toBe("octocat");
    expect(() => normalizeGithubHandle("bad handle")).toThrow(/Invalid GitHub/);
  });

  it.effect("fetchGithubUserEffect maps 404 to found=false", () =>
    Effect.gen(function* fetchGithubUserGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
      );

      const snap = yield* fetchGithubUserEffect(
        "missing-user",
        AbortSignal.timeout(5000)
      );

      expect(githubUserSnapshotSchema.parse(snap).found).toBe(false);
      expect(snap.status).toBe(404);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
