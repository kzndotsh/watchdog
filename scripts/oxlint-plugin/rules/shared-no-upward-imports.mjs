import {
  moduleSourceVisitors,
  resolveWebSpecifier,
  webSrcPath,
} from "../lib/web-modules.mjs";

/**
 * @typedef {{ filename: string, report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/**
 * Bans `shared/` importing from `domains/`, `app/` or `routes/` (an `@/` alias or a relative
 * path that lands there; static, re-export, `import()`, `require()` and `import("x").T` forms,
 * type imports included). `shared/` is the layer domains and the `app/` composition root build
 * on: a back edge makes it change whenever a domain or the app wiring does. Primitives and
 * tests are not special-cased: nothing under `shared/` may reach upward.
 */
export const sharedNoUpwardImports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban apps/web/src/shared importing from apps/web/src/domains, app or routes.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const fileRel = webSrcPath(context.filename);
    if (fileRel === null || !fileRel.startsWith("shared/")) return {};
    return moduleSourceVisitors((specifier, node) => {
      const target = resolveWebSpecifier(fileRel, specifier);
      const layer = target?.match(/^(domains|app|routes)(\/|$)/)?.[1];
      if (layer === undefined) return;
      context.report({
        node,
        message: `shared/ imports ${layer}/ code (${specifier}): shared/ sits below domains and the app/ composition root, so move what it needs into shared/ or @watchdog/schemas, move this file into its domain (single-domain code) or into app/ (cross-domain wiring), or pass data in through props (conventions: shared imports no domain, app or route)`,
      });
    });
  },
};
