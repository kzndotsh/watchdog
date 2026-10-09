import { isRecord } from "../lib/ast.mjs";
import { bansNode, REPO_CONTRACT } from "../lib/db-repo.mjs";

const VALIDATION = /^(?:zod|drizzle-zod)(?:\/|$)/;

/** Repos do not re-validate: Zod at the boundary and core `*Effect` own validation. */
export const dbRepoNoValidationImport = bansNode({
  type: "ImportDeclaration",
  test: (node) =>
    isRecord(node.source) &&
    typeof node.source.value === "string" &&
    VALIDATION.test(node.source.value),
  description: "Ban zod imports in packages/db repos.",
  message: `Repos do not validate: Zod schemas live in @watchdog/schemas and core owns display-string validation; take plain values (${REPO_CONTRACT}).`,
});
