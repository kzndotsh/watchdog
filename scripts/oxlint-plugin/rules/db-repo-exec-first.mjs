import { isRecord, typeNameOf } from "../lib/ast.mjs";
import {
  isRepoMethod,
  repoMethodName,
  REPO_CONTRACT,
} from "../lib/db-repo.mjs";

/** Every repo method takes the pool-or-transaction handle `exec: DbExec` first. */
export const dbRepoExecFirst = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a leading `exec: DbExec` parameter on repo methods.",
    },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    return {
      /** @param {Record<string, unknown>} node */
      Property(node) {
        if (!isRepoMethod(node)) return;
        const fn = isRecord(node.value) ? node.value : {};
        const params = Array.isArray(fn.params) ? fn.params : [];
        const first = isRecord(params[0]) ? params[0] : null;
        const annotation =
          first !== null && isRecord(first.typeAnnotation)
            ? first.typeAnnotation.typeAnnotation
            : null;
        const named =
          first?.type === "Identifier" &&
          first.name === "exec" &&
          first.optional !== true;
        const typed =
          isRecord(annotation) &&
          annotation.type === "TSTypeReference" &&
          typeNameOf(annotation.typeName) === "DbExec";
        if (named && typed) return;
        context.report({
          node,
          message: `${repoMethodName(node) ?? "method"} must take \`exec: DbExec\` as its first parameter so callers can join a transaction (${REPO_CONTRACT}).`,
        });
      },
    };
  },
};
