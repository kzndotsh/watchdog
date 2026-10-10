import { isRecord } from "../lib/ast.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/** Modules whose `Button` export is the control: the wrapper and the vanilla primitive. */
const BUTTON_MODULE =
  /(?:^@\/shared\/ui\/primitives\/button$|^@watchdog\/ui\/components\/button$|\/primitives\/button$)/;

/** A height utility: `h-*`, `min-h-*`, `max-h-*`, `size-*` (which sets height too). */
const HEIGHT_UTILITY = /^(?:(?:min-|max-)?h|size)-/;

/**
 * Splits a class token on `:` outside brackets: `data-[size=sm]:h-7` gives
 * `["data-[size=sm]", "h-7"]`.
 * @param {string} token
 * @returns {string[]}
 */
const splitVariants = (token) => {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === "[" || ch === "(") depth += 1;
    else if (ch === "]" || ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) {
      parts.push(token.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(token.slice(start));
  return parts;
};

/**
 * The class tokens of `source` that set the element's own height. A token behind a
 * child-targeting variant (`[&_svg]:size-4`, `*:size-4`) styles a descendant and stays legal.
 * @param {string} source
 * @returns {string[]}
 */
const heightTokens = (source) =>
  source.split(/\s+/).filter((token) => {
    const parts = splitVariants(token);
    const utility = (parts.at(-1) ?? "").replaceAll(/^!|!$/g, "");
    if (!HEIGHT_UTILITY.test(utility)) return false;
    return !parts
      .slice(0, -1)
      .some((variant) => variant.includes("&") || variant.startsWith("*"));
  });

/** Expression nodes whose class strings come from these child fields. */
/** @type {Record<string, string[]>} */
const CHILDREN = {
  JSXExpressionContainer: ["expression"],
  TSAsExpression: ["expression"],
  TSSatisfiesExpression: ["expression"],
  TSNonNullExpression: ["expression"],
  ParenthesizedExpression: ["expression"],
  ConditionalExpression: ["consequent", "alternate"],
  LogicalExpression: ["left", "right"],
  BinaryExpression: ["left", "right"],
  CallExpression: ["arguments"],
  ArrayExpression: ["elements"],
  SpreadElement: ["argument"],
};

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * The className expression of an attribute list: `className=...` or a
 * `{...{ className: ... }}` spread of an object literal.
 * @param {readonly unknown[]} attributes
 * @returns {unknown[]}
 */
const classNameValues = (attributes) =>
  attributes.flatMap((attr) => {
    if (!isRecord(attr)) return [];
    if (
      attr.type === "JSXAttribute" &&
      isRecord(attr.name) &&
      attr.name.name === "className"
    ) {
      return [attr.value];
    }
    if (
      attr.type === "JSXSpreadAttribute" &&
      isRecord(attr.argument) &&
      attr.argument.type === "ObjectExpression" &&
      Array.isArray(attr.argument.properties)
    ) {
      return attr.argument.properties.flatMap((p) =>
        isRecord(p) &&
        p.type === "Property" &&
        isRecord(p.key) &&
        (p.key.name === "className" || p.key.value === "className")
          ? [p.value]
          : []
      );
    }
    return [];
  });

/**
 * Bans height utilities on the Button wrapper (`<Button className="h-8">`, in a string,
 * template literal, `cn()` / `clsx()` argument, a const the className names, or a spread
 * `{...{ className }}`; aliased and namespace imports are followed). The size scale
 * (`xs` / `sm` / default / `lg`, `icon*`, `inline`) owns Button height, so a height
 * override means a size is missing: add it to the wrapper, never patch the call site.
 * A spread of a variable (`{...props}`) cannot be read and passes. The wrapper's own
 * folder and tests are switched off by `overrides` in `oxlint.config.ts`; sites that
 * have not migrated would be baselined per file (none today).
 */
export const noButtonHeightClass = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban height utilities (h-*, min-h-*, max-h-*, size-*) on Button in apps/web.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    /** Local names bound to a Button component. */
    const buttons = new Set();
    /** Local names bound to a namespace import of a button module. */
    const namespaces = new Set();
    /** Program-level `const NAME = <expr>` initializers, for className identifiers. */
    /** @type {Map<string, unknown>} */
    const consts = new Map();
    /** @type {{ node: unknown, values: unknown[] }[]} */
    const pending = [];

    /**
     * Every string a class expression can contribute.
     * @param {unknown} node
     * @param {Set<unknown>} seen
     * @returns {string[]}
     */
    const classStrings = (node, seen) => {
      if (!isRecord(node) || seen.has(node)) return [];
      seen.add(node);
      const type = String(node.type);
      if (type === "Literal") {
        return typeof node.value === "string" ? [node.value] : [];
      }
      if (type === "TemplateLiteral") {
        const quasis = asArray(node.quasis).flatMap((q) =>
          isRecord(q) && isRecord(q.value) && typeof q.value.raw === "string"
            ? [q.value.raw]
            : []
        );
        return [
          ...quasis,
          ...asArray(node.expressions).flatMap((e) => classStrings(e, seen)),
        ];
      }
      if (type === "Identifier") {
        return typeof node.name === "string" && consts.has(node.name)
          ? classStrings(consts.get(node.name), seen)
          : [];
      }
      if (type === "ObjectExpression") {
        // `clsx({ "h-8": on })`: the keys are the classes.
        return asArray(node.properties).flatMap((p) =>
          isRecord(p) && p.type === "Property" && p.computed !== true
            ? classStrings(p.key, seen)
            : []
        );
      }
      return (CHILDREN[type] ?? []).flatMap((key) => {
        const child = node[key];
        /** @type {unknown[]} */
        const list = Array.isArray(child) ? child : [child];
        return list.flatMap((c) => classStrings(c, seen));
      });
    };

    /**
     * @param {unknown} name JSX element name
     * @returns {boolean}
     */
    const isButton = (name) => {
      if (!isRecord(name)) return false;
      if (name.type === "JSXIdentifier") {
        return typeof name.name === "string" && buttons.has(name.name);
      }
      if (name.type === "JSXMemberExpression") {
        return (
          isRecord(name.object) &&
          name.object.type === "JSXIdentifier" &&
          typeof name.object.name === "string" &&
          namespaces.has(name.object.name) &&
          isRecord(name.property) &&
          name.property.name === "Button"
        );
      }
      return false;
    };

    return {
      /** @param {{ source?: unknown, specifiers?: readonly unknown[] }} node */
      ImportDeclaration(node) {
        const source = isRecord(node.source) ? node.source.value : null;
        if (typeof source !== "string" || !BUTTON_MODULE.test(source)) return;
        for (const spec of node.specifiers ?? []) {
          if (!isRecord(spec) || !isRecord(spec.local)) continue;
          const local = spec.local.name;
          if (typeof local !== "string") continue;
          if (spec.type === "ImportNamespaceSpecifier") namespaces.add(local);
          else if (
            spec.type === "ImportSpecifier" &&
            isRecord(spec.imported) &&
            (spec.imported.name === "Button" ||
              spec.imported.value === "Button")
          ) {
            buttons.add(local);
          }
        }
      },
      /** @param {{ id?: unknown, init?: unknown }} node */
      VariableDeclarator(node) {
        if (
          isRecord(node.id) &&
          node.id.type === "Identifier" &&
          typeof node.id.name === "string" &&
          isRecord(node.init)
        ) {
          consts.set(node.id.name, node.init);
        }
      },
      /** @param {{ name?: unknown, attributes?: readonly unknown[] }} node */
      JSXOpeningElement(node) {
        if (buttons.size + namespaces.size === 0 || !isButton(node.name)) {
          return;
        }
        pending.push({ node, values: classNameValues(node.attributes ?? []) });
      },
      // Resolved at the end so a const declared below its use still counts.
      "Program:exit"() {
        for (const { node, values } of pending) {
          const found = values.flatMap((value) =>
            classStrings(value, new Set()).flatMap(heightTokens)
          );
          if (found.length === 0) continue;
          const tokens = [...new Set(found)].join(" ");
          context.report({
            node,
            message: `<Button> sets its height with ${tokens}: height belongs to the size scale, so use size="xs" (h-5), "sm" (h-6), default (h-7) or "lg" (h-8), the square "icon-xs" / "icon-sm" / "icon" / "icon-lg", or "inline" for a text link, and add a size to the wrapper in shared/ui/primitives/button.tsx when none fits (conventions: no height utilities on Button)`,
          });
        }
      },
    };
  },
};
