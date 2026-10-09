import {
  moduleSourceVisitors,
  resolveWebSpecifier,
  webSrcPath,
} from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/**
 * Bans a relative import in `domains/<x>/**` that resolves outside `domains/<x>/`
 * (`../../other-domain/...`, `../../../../shared/ui/...`). Inside a domain relative
 * paths are fine; anything that leaves it names its target with the `@/` alias, so a
 * cross-domain edge is greppable and does not break when a file moves.
 */
export const noCrossDomainRelativeImports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require the @/ alias for imports that leave a domain folder in apps/web.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const fileRel = webSrcPath(context.filename);
    const domain =
      fileRel === null ? null : /^domains\/([^/]+)\//.exec(fileRel);
    if (fileRel === null || domain === null) return {};
    const own = `domains/${domain[1]}/`;
    return moduleSourceVisitors((specifier, node) => {
      if (!specifier.startsWith(".")) return;
      const target = resolveWebSpecifier(fileRel, specifier);
      // A target outside `src` (`../` left over) has no alias to name.
      if (
        target === null ||
        target.startsWith("../") ||
        `${target}/`.startsWith(own)
      ) {
        return;
      }
      context.report({
        node,
        message: `Relative import ${specifier} leaves the ${domain[1]} domain: import it as \`@/${target}\`; relative paths stay inside the domain folder (conventions: imports that leave a domain use the @/ alias)`,
      });
    });
  },
};
