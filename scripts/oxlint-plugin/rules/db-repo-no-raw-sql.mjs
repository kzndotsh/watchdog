import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import { collectImports, isDrizzleModule } from "../lib/db-imports.mjs";
import { memberName } from "../lib/db-repo.mjs";

const MESSAGE =
  "Repos use the drizzle builder API: replace this raw sql fragment with builder operators (eq, and, inArray, ilike, ...) (packages/db/AGENTS.md Schema conventions).";

/**
 * Repos use the builder API; a raw `sql` template is a hand-written fragment. Follows
 * `import { sql as q } from "drizzle-orm"` and `import * as d from "drizzle-orm"`
 * (`d.sql`...). Existing fragments are baselined per file (shrink-only): fix them, never
 * raise a count.
 */
export const dbRepoNoRawSql = withBaseline("db-repo-no-raw-sql", {
  meta: {
    type: "problem",
    docs: {
      description: "Ban raw sql template fragments in packages/db repos.",
    },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    /** @type {Set<string>} */
    let tags = new Set(["sql"]);
    /** @type {Set<string>} */
    let namespaces = new Set();
    return {
      /** @param {unknown} program */
      Program(program) {
        const imports = collectImports(program, isDrizzleModule);
        namespaces = imports.namespaces;
        tags = new Set(imports.named.get("sql"));
        // Unimported `sql` (a local helper) keeps its old meaning unless another module
        // binds the name.
        if (!imports.others.has("sql")) tags.add("sql");
      },
      /** @param {Record<string, unknown>} node */
      TaggedTemplateExpression(node) {
        const { tag } = node;
        if (!isRecord(tag)) return;
        const bare =
          tag.type === "Identifier" &&
          typeof tag.name === "string" &&
          tags.has(tag.name);
        const qualified =
          tag.type === "MemberExpression" &&
          memberName(tag) === "sql" &&
          isRecord(tag.object) &&
          tag.object.type === "Identifier" &&
          typeof tag.object.name === "string" &&
          namespaces.has(tag.object.name);
        if (bare || qualified) context.report({ node, message: MESSAGE });
      },
    };
  },
});
