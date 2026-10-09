import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import { bansNode } from "../lib/db-repo.mjs";

/**
 * Repos use the builder API; a raw `sql` template is a hand-written fragment. Existing
 * fragments are baselined per file (shrink-only): fix them, never raise a count.
 */
export const dbRepoNoRawSql = withBaseline(
  "db-repo-no-raw-sql",
  bansNode({
    type: "TaggedTemplateExpression",
    test: (node) =>
      isRecord(node.tag) &&
      node.tag.type === "Identifier" &&
      node.tag.name === "sql",
    description: "Ban raw sql template fragments in packages/db repos.",
    message:
      "Repos use the drizzle builder API: replace this raw sql fragment with builder operators (eq, and, inArray, ilike, ...) (packages/db/AGENTS.md Schema conventions).",
  })
);
