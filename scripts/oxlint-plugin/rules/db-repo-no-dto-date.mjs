import { bansNode, memberName, REPO_CONTRACT } from "../lib/db-repo.mjs";

/** Repos return rows, not DTOs: date formatting belongs in the service. */
export const dbRepoNoDtoDate = bansNode({
  type: "CallExpression",
  test: (node) => memberName(node.callee) === "toISOString",
  description: "Ban .toISOString() in packages/db repos.",
  message: `Repos return rows, not DTOs: return the Date and format it in the service (${REPO_CONTRACT} rule 1).`,
});
