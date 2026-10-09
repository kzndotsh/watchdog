import { isRecord } from "../lib/ast.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/** Names that hold an opaque id or content hash. */
const OPAQUE_NAMES = new Set([
  "sha256",
  "jobId",
  "proposalId",
  "entityId",
  "id",
]);

/**
 * Last name of a plain identifier or non-computed member (`id`, `job.id`).
 * @param {unknown} node
 * @returns {string | null}
 */
const lastName = (node) => {
  if (!isRecord(node)) return null;
  if (node.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }
  if (
    node.type === "MemberExpression" &&
    node.computed !== true &&
    isRecord(node.property) &&
    typeof node.property.name === "string"
  ) {
    return node.property.name;
  }
  return null;
};

/**
 * A numeric literal, optionally signed (`8`, `-4`).
 * @param {unknown} arg
 * @param {number | null} value required value, or null for any number
 * @returns {boolean}
 */
const isNumber = (arg, value) => {
  if (!isRecord(arg)) return false;
  if (
    arg.type === "UnaryExpression" &&
    (arg.operator === "-" || arg.operator === "+")
  ) {
    return value === null && isNumber(arg.argument, null);
  }
  return (
    arg.type === "Literal" &&
    typeof arg.value === "number" &&
    (value === null || arg.value === value)
  );
};

/**
 * Bans `<id>.slice(0, N)` on opaque ids and hashes (`sha256`, `jobId`, `proposalId`,
 * `entityId`, `id`, `x.id`): a truncated id collides and cannot be searched. Render it
 * with `IdChip` / `formatOpaqueId`. No autofix: the helper adds an ellipsis and needs an
 * import, so the replacement is a human choice.
 */
export const noOpaqueIdSlice = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban .slice(0, N) on opaque ids and hashes in apps/web domains; use IdChip / formatOpaqueId.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {{ callee?: unknown, arguments?: readonly unknown[] }} node */
      CallExpression(node) {
        const { callee } = node;
        const args = node.arguments ?? [];
        if (
          !isRecord(callee) ||
          callee.type !== "MemberExpression" ||
          callee.computed === true ||
          lastName(callee.property) !== "slice" ||
          args.length !== 2 ||
          !isNumber(args[0], 0) ||
          !isNumber(args[1], null)
        ) {
          return;
        }
        const name = lastName(callee.object);
        if (name === null || !OPAQUE_NAMES.has(name)) return;
        context.report({
          node,
          message: `${name}.slice(0, N) truncates an opaque id or hash, which collides and cannot be searched: render it with IdChip (JSX) or formatOpaqueId (strings) from apps/web/src/shared/ui (conventions: opaque ids render via IdChip / formatOpaqueId)`,
        });
      },
    };
  },
};
