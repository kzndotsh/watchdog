import { isRecord } from "../lib/ast.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const DERIVED_FLAGS = new Set(["needs_key", "third_party"]);
const UA_PREFIX = /^Watchdog\/\d/;

/** @param {unknown} node */
const stringOf = (node) => {
  if (isRecord(node) && node.type === "Literal") {
    return typeof node.value === "string" ? node.value : "";
  }
  return "";
};

/** @param {unknown} prop */
const keyOf = (prop) => {
  if (!isRecord(prop) || prop.type !== "Property" || !isRecord(prop.key)) {
    return "";
  }
  if (prop.key.type === "Identifier" && typeof prop.key.name === "string") {
    return prop.key.name;
  }
  return stringOf(prop.key);
};

/**
 * Cap metadata that is derived has one home. In `packages/caps/src` (tests exempt) this bans
 * a `"Watchdog/<version> ..."` string (the User-Agent is `watchdogUserAgent(id)`, handed to
 * `defineCollectCap`'s `fetch` as `{ userAgent }`), a `reportLabel` that repeats the Cap's
 * own `id` (the default), and `"needs_key"` / `"third_party"` in `flags` (they derive from
 * `credentials` and `egress`; the type refuses them too).
 */
export const noDerivedCapMetadata = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban hand-written copies of derived Cap metadata (user agent, reportLabel equal to id, needs_key / third_party flags).",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const file = context.filename.replaceAll("\\", "/");
    if (/(?:^|\/)__tests__\/|\.test\.tsx?$/.test(file)) return {};
    return {
      /** @param {{ value?: unknown }} node */
      Literal(node) {
        if (typeof node.value === "string" && UA_PREFIX.test(node.value)) {
          context.report({
            node,
            message:
              "Hard-coded Watchdog User-Agent: use `watchdogUserAgent(id)` from @watchdog/tools/errors; a defineCollectCap `fetch(ctx, { userAgent })` already receives it (conventions: derived Cap metadata has one source).",
          });
        }
      },
      /** @param {{ properties?: readonly unknown[] }} node */
      ObjectExpression(node) {
        const props = node.properties ?? [];
        /** @param {string} name */
        const find = (name) => props.find((prop) => keyOf(prop) === name);
        const idProp = find("id");
        const labelProp = find("reportLabel");
        const id = isRecord(idProp) ? stringOf(idProp.value) : "";
        if (
          isRecord(labelProp) &&
          id !== "" &&
          stringOf(labelProp.value) === id
        ) {
          context.report({
            node: labelProp,
            message: `reportLabel "${id}" repeats the Cap id: drop it, reportLabel defaults to the id (conventions: derived Cap metadata has one source).`,
          });
        }
        const flagsProp = find("flags");
        if (
          isRecord(flagsProp) &&
          isRecord(flagsProp.value) &&
          flagsProp.value.type === "ArrayExpression" &&
          Array.isArray(flagsProp.value.elements)
        ) {
          for (const element of flagsProp.value.elements) {
            const flag = stringOf(element);
            if (DERIVED_FLAGS.has(flag)) {
              context.report({
                node: element,
                message: `The "${flag}" flag is derived (needs_key from credentials, third_party from egress): remove it from \`flags\` (conventions: derived Cap metadata has one source).`,
              });
            }
          }
        }
      },
    };
  },
};
