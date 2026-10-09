import { isRecord, typeNameOf } from "../lib/ast.mjs";
import { bansNode, REPO_CONTRACT } from "../lib/db-repo.mjs";

/** Repos take plain values, never drizzle `SQL` fragments. */
export const dbRepoNoSqlParam = bansNode({
  type: "TSTypeReference",
  test: (node) => isRecord(node) && typeNameOf(node.typeName) === "SQL",
  description: "Ban the drizzle SQL type in packages/db repos.",
  message: `Repos take plain values, never drizzle SQL fragments: pass the value and build the condition inside the repo (${REPO_CONTRACT} rule 5).`,
});
