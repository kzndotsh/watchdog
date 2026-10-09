import { isRecord } from "../lib/ast.mjs";
import { REPO_CONTRACT } from "../lib/db-repo.mjs";

const VALIDATION = /^(?:zod|drizzle-zod)(?:\/|$)/;

/** Repos do not re-validate: Zod at the boundary and core `*Effect` own validation. */
export const dbRepoNoValidationImport = {
  meta: {
    type: "problem",
    docs: { description: "Ban zod imports in packages/db repos." },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    const message = `Repos do not validate: Zod schemas live in @watchdog/schemas and core owns display-string validation; take plain values (${REPO_CONTRACT}).`;
    /** @param {Record<string, unknown>} node */
    const check = (node) => {
      const { source } = node;
      if (
        isRecord(source) &&
        typeof source.value === "string" &&
        VALIDATION.test(source.value)
      ) {
        context.report({ node, message });
      }
    };
    return {
      ImportDeclaration: check,
      ImportExpression: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};
