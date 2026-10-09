import { isRecord } from "../lib/ast.mjs";
import { REPO_CONTRACT } from "../lib/db-repo.mjs";

/** Job statuses (mirrors JOB_STATUSES in @watchdog/schemas vocab). */
const JOB_STATUSES = new Set([
  "queued",
  "running",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
]);

/**
 * The status named by a string literal or an expression-free template literal.
 * @param {unknown} node
 * @returns {string | null}
 */
const statusOf = (node) => {
  if (!isRecord(node)) return null;
  /** @type {unknown} */
  let text = null;
  if (node.type === "Literal") {
    text = node.value;
  } else if (
    node.type === "TemplateLiteral" &&
    Array.isArray(node.expressions) &&
    node.expressions.length === 0 &&
    Array.isArray(node.quasis) &&
    isRecord(node.quasis[0]) &&
    isRecord(node.quasis[0].value)
  ) {
    text = node.quasis[0].value.cooked;
  }
  return typeof text === "string" && JOB_STATUSES.has(text) ? text : null;
};

/** A repo defines no job status set: the vocabulary owns the named sets. */
export const dbRepoNoJobStatusSet = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban array literals of two or more job statuses in packages/db repos.",
    },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    return {
      /** @param {Record<string, unknown>} node */
      ArrayExpression(node) {
        const elements = Array.isArray(node.elements) ? node.elements : [];
        const found = new Set(elements.map(statusOf).filter((s) => s !== null));
        if (found.size < 2) return;
        context.report({
          node,
          message: `Repos define no job status set: use the named sets and predicates from @watchdog/schemas vocab (OPEN_JOB_STATUSES, CANCELLABLE_JOB_STATUSES, LIVE_JOB_STATUSES, TERMINAL_JOB_STATUSES) (${REPO_CONTRACT}).`,
        });
      },
    };
  },
};
