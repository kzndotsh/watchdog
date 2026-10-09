import { isRecord, typeNameOf } from "../lib/ast.mjs";
import { collectImports, isDrizzleModule } from "../lib/db-imports.mjs";
import { REPO_CONTRACT } from "../lib/db-repo.mjs";

/**
 * Repos take plain values, never drizzle `SQL` fragments. Follows aliases
 * (`import type { SQL as Fragment } from "drizzle-orm"`) and namespaces (`d.SQL`) from
 * drizzle-orm only; imports are collected up front, so a use that precedes its import is
 * still judged. An unrelated module's `SQL` shadows the name.
 */
export const dbRepoNoSqlParam = {
  meta: {
    type: "problem",
    docs: { description: "Ban the drizzle SQL type in packages/db repos." },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    /** @type {Set<string>} */
    let names = new Set(["SQL"]);
    /** @type {Set<string>} */
    let namespaces = new Set();
    return {
      /** @param {unknown} program */
      Program(program) {
        const imports = collectImports(program, isDrizzleModule);
        namespaces = imports.namespaces;
        names = new Set(imports.named.get("SQL"));
        if (!imports.others.has("SQL")) names.add("SQL");
      },
      /** @param {Record<string, unknown>} node */
      TSTypeReference(node) {
        const ref = node.typeName;
        const hit =
          isRecord(ref) && ref.type === "TSQualifiedName"
            ? typeNameOf(ref.right) === "SQL" &&
              isRecord(ref.left) &&
              typeof ref.left.name === "string" &&
              namespaces.has(ref.left.name)
            : names.has(typeNameOf(ref) ?? "");
        if (hit) {
          context.report({
            node,
            message: `Repos take plain values, never drizzle SQL fragments: pass the value and build the condition inside the repo (${REPO_CONTRACT} rule 5).`,
          });
        }
      },
    };
  },
};
