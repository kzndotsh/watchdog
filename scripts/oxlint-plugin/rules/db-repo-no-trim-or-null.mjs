import { bansNode, calleeName, REPO_CONTRACT } from "../lib/db-repo.mjs";

/** Display-string trimming is core / schemas work, never a repo's. */
export const dbRepoNoTrimOrNull = bansNode({
  type: "CallExpression",
  test: (node) => calleeName(node) === "trimmedOrNull",
  description: "Ban trimmedOrNull in packages/db repos.",
  message: `Repos must not trim display strings: use trimmedOrNull in core or schemas, and keep repos to lookup scoping (${REPO_CONTRACT}).`,
});
