import { bansNode, REPO_CONTRACT } from "../lib/db-repo.mjs";

/** Repos never throw: they return `null` / `[]` and the service decides 404 vs conflict. */
export const dbRepoNoThrow = bansNode({
  type: "ThrowStatement",
  test: () => true,
  description: "Ban throw in packages/db repos.",
  message: `Repos must not throw: return null / [] and let the service decide 404 vs conflict; unique-violation mapping lives in core (tryDb / mapPostgresCatch) (${REPO_CONTRACT} rule 3).`,
});
