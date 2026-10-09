import {
  moduleSourceVisitors,
  resolveWebSpecifier,
  webSrcPath,
} from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/**
 * Bans `shared/ui` importing from `domains/**` (`@/domains/...` or a relative path that
 * lands there; static, re-export, `import()`, `require()` and `import("x").T` forms, type
 * imports included). `shared/ui` is the layer domains build on: a back edge makes the
 * atom layer depend on a screen. `shared/ui/primitives` and tests are not special-cased:
 * nothing in `shared/ui` may reach a domain.
 */
export const sharedUiNoDomainImports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban apps/web/src/shared/ui importing from apps/web/src/domains.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const fileRel = webSrcPath(context.filename);
    if (fileRel === null || !fileRel.startsWith("shared/ui/")) return {};
    return moduleSourceVisitors((specifier, node) => {
      const target = resolveWebSpecifier(fileRel, specifier);
      if (target === null || !/^domains(\/|$)/.test(target)) return;
      context.report({
        node,
        message: `shared/ui imports domain code (${specifier}): shared/ui sits below domains, so move the helper or type it needs into shared/ (shared/lib, shared/ui) or @watchdog/schemas, or move this component into its domain and pass data in through props (conventions: shared/ui never imports a domain)`,
      });
    });
  },
};
