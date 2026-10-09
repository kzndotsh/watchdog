import { isRecord, typeNameOf } from "../lib/ast.mjs";
import { REPO_CONTRACT } from "../lib/db-repo.mjs";

/**
 * Repos take plain values, never drizzle `SQL` fragments. A local alias of an imported
 * `SQL` (`import type { SQL as Fragment }`) is followed within its own file.
 */
export const dbRepoNoSqlParam = {
  meta: {
    type: "problem",
    docs: { description: "Ban the drizzle SQL type in packages/db repos." },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    const names = new Set(["SQL"]);
    return {
      /** @param {{ specifiers: readonly unknown[] }} node */
      ImportDeclaration(node) {
        for (const spec of node.specifiers) {
          if (!isRecord(spec) || spec.type !== "ImportSpecifier") continue;
          const local = typeNameOf(spec.local);
          if (typeNameOf(spec.imported) === "SQL" && local !== null) {
            names.add(local);
          }
        }
      },
      /** @param {Record<string, unknown>} node */
      TSTypeReference(node) {
        const name = typeNameOf(node.typeName);
        if (name !== null && names.has(name)) {
          context.report({
            node,
            message: `Repos take plain values, never drizzle SQL fragments: pass the value and build the condition inside the repo (${REPO_CONTRACT} rule 5).`,
          });
        }
      },
    };
  },
};
