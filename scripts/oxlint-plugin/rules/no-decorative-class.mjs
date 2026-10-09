import { isLineAllowed, lineOfOffset } from "../lib/ds-allow.mjs";

/**
 * @typedef {{ range: readonly [number, number] }} Ranged
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void, sourceCode: { text: string } }} RuleContext
 */

/** Gradients, gradient text and glass: the DESIGN.md refuse list. */
const DECORATIVE_RE =
  /\b(?:bg-gradient-to-|bg-linear-|bg-radial|bg-conic|bg-clip-text|backdrop-blur(?!-none\b))/g;

/**
 * Bans decorative Tailwind classes (gradients, gradient text, glass / backdrop blur) in
 * web class strings. Allowed trees are exempted in `oxlint.config.ts`; functional blur
 * takes a `// ds:allow-decorative - reason` comment on the line above.
 */
export const noDecorativeClass = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban gradient, gradient-text and glass classes in apps/web (DESIGN.md refuse list).",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    /**
     * @param {Ranged} node
     * @param {string} token
     */
    const report = (node, token) => {
      context.report({
        node,
        message: `${token} is on the refuse list (gradient / gradient text / glass): use a flat token surface (DESIGN.md Do's and Don'ts). For functional blur add \`// ds:allow-decorative - reason\` on the line above (conventions: no gradients, glass or backdrop blur)`,
      });
    };
    /**
     * @param {Ranged} node
     * @param {string} source source text of the string, matched against the ban
     */
    const check = (node, source) => {
      const { text } = context.sourceCode;
      // A template element's range may include its opening backtick: anchor on the text.
      const found = text.indexOf(source, node.range[0]);
      const base = found === -1 ? node.range[0] : found;
      for (const match of source.matchAll(DECORATIVE_RE)) {
        const line = lineOfOffset(text, base + match.index);
        if (isLineAllowed(text, line, "decorative")) continue;
        report(node, match[0]);
        return;
      }
    };
    return {
      /** @param {Ranged & { value?: unknown, raw?: string }} node */
      Literal(node) {
        if (typeof node.value === "string") check(node, node.raw ?? node.value);
      },
      /** @param {Ranged & { value: { raw: string } }} node */
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};
