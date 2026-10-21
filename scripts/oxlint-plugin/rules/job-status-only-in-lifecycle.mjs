import { isRecord } from "../lib/ast.mjs";

const MESSAGE =
  "A Job's status changes only through the lifecycle module (packages/core/src/jobs/lifecycle/: settleJobEffect, cancelWithin, stop, run, reconcileJobsEffect); only `jobsRepo.settle` (db jobs-settle.repo.ts) writes it, and only lifecycle/settle.ts calls that. Admission may insert a `queued` Job.";

/**
 * Name of a member call's property (`x.settle(...)` gives `settle`).
 * @param {unknown} callee
 * @returns {string | null}
 */
const methodName = (callee) =>
  isRecord(callee) &&
  callee.type === "MemberExpression" &&
  !callee.computed &&
  isRecord(callee.property) &&
  typeof callee.property.name === "string"
    ? callee.property.name
    : null;

/**
 * Whether `node` is `<anything>.<verb>(jobs)`.
 * @param {unknown} node
 * @param {string} verb
 */
const isJobsCall = (node, verb) =>
  isRecord(node) &&
  node.type === "CallExpression" &&
  methodName(node.callee) === verb &&
  Array.isArray(node.arguments) &&
  isRecord(node.arguments[0]) &&
  node.arguments[0].type === "Identifier" &&
  node.arguments[0].name === "jobs";

/**
 * Object literals in a `.set(...)` / `.values(...)` argument: the argument itself, or the
 * object arguments of a wrapper call such as `setOrTouch({ ... })`.
 * @param {unknown} arg
 * @returns {Record<string, unknown>[]}
 */
const objectsIn = (arg) => {
  if (!isRecord(arg)) return [];
  if (arg.type === "ObjectExpression") return [arg];
  if (arg.type === "CallExpression" && Array.isArray(arg.arguments)) {
    /** @type {unknown[]} */
    const args = arg.arguments;
    /** @type {Record<string, unknown>[]} */
    const objects = [];
    for (const a of args) {
      if (isRecord(a) && a.type === "ObjectExpression") objects.push(a);
    }
    return objects;
  }
  return [];
};

/**
 * The `status` property of an object literal, or undefined.
 * @param {Record<string, unknown>} object
 * @returns {unknown}
 */
const statusProperty = (object) => {
  /** @type {unknown[]} */
  const properties = Array.isArray(object.properties) ? object.properties : [];
  return properties.find(
    (p) =>
      isRecord(p) &&
      p.type === "Property" &&
      isRecord(p.key) &&
      (p.key.name === "status" || p.key.value === "status")
  );
};

/**
 * Whether a property's value is the string literal `queued`.
 * @param {unknown} property
 */
const isQueued = (property) =>
  isRecord(property) &&
  isRecord(property.value) &&
  property.value.type === "Literal" &&
  property.value.value === "queued";

/**
 * Job status writes outside the lifecycle module: `jobsRepo.settle(...)`, a drizzle
 * `update(jobs).set({ status })`, or an `insert(jobs).values({ status })` that is not `queued`.
 * Scope (and the lifecycle, seed and test exemptions) is set in `oxlint.config.ts`. Matching is
 * by name: an aliased `jobs` import and raw `sql` updates are not seen, and `JobPatch` (which
 * has no `status`) covers a patch passed through a variable.
 */
export const jobStatusOnlyInLifecycle = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban Job status writes (jobsRepo.settle, update(jobs).set({ status }), non-queued insert) outside the lifecycle module.",
    },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    return {
      /** @param {Record<string, unknown>} node */
      CallExpression(node) {
        const name = methodName(node.callee);
        const callee = node.callee;
        if (!isRecord(callee)) return;
        if (
          name === "settle" &&
          isRecord(callee.object) &&
          (callee.object.name === "jobsRepo" ||
            callee.object.name === "jobsSettleRepo")
        ) {
          context.report({ node, message: MESSAGE });
          return;
        }
        if (
          (name !== "set" && name !== "values") ||
          !Array.isArray(node.arguments)
        ) {
          return;
        }
        const isWrite =
          name === "set"
            ? isJobsCall(callee.object, "update")
            : isJobsCall(callee.object, "insert");
        if (!isWrite) return;
        for (const object of objectsIn(node.arguments[0])) {
          const status = statusProperty(object);
          if (status === undefined) continue;
          if (name === "values" && isQueued(status)) continue;
          context.report({ node: status, message: MESSAGE });
        }
      },
    };
  },
};
