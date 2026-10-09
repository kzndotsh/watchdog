import { isRecord } from "../lib/ast.mjs";
import { isLineAllowed } from "../lib/ds-allow.mjs";

/**
 * @typedef {{ loc: { start: { line: number } } }} Located
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void, sourceCode: { text: string } }} RuleContext
 */

/** Screen names that tell you nothing: `*Console`, `*Workbench`, `*Tape`. */
const SURFACE_NAME_RE = /(?:Console|Workbench|Tape)$/;

/**
 * Bans exporting a function, class or const named `*Console`, `*Workbench` or `*Tape`.
 * Screens are named by layout kind (Queue + Detail); see the UI chrome lexicon. The
 * escape hatch is `// ds:allow-surface-name - reason` on the line above.
 */
export const noBannedSurfaceName = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban exports named *Console, *Workbench or *Tape in apps/web (chrome lexicon).",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    /**
     * @param {unknown} id
     * @param {Located} node
     */
    const check = (id, node) => {
      if (
        !isRecord(id) ||
        id.type !== "Identifier" ||
        typeof id.name !== "string" ||
        !SURFACE_NAME_RE.test(id.name)
      ) {
        return;
      }
      if (
        isLineAllowed(
          context.sourceCode.text,
          node.loc.start.line,
          "surface-name"
        )
      ) {
        return;
      }
      context.report({
        node: id,
        message: `${id.name} is a banned surface name (Console / Workbench / Tape): name screens by layout kind, a Queue + Detail screen is a SplitView (docs/reference/web/ui/README.md chrome lexicon; conventions: screens are named by layout kind). Escape hatch: \`// ds:allow-surface-name - reason\` on the line above.`,
      });
    };
    return {
      /** @param {{ declaration?: unknown, specifiers?: readonly unknown[] } & Located} node */
      ExportNamedDeclaration(node) {
        const { declaration } = node;
        if (isRecord(declaration)) {
          if (
            declaration.type === "FunctionDeclaration" ||
            declaration.type === "ClassDeclaration"
          ) {
            check(declaration.id, node);
          } else if (
            declaration.type === "VariableDeclaration" &&
            Array.isArray(declaration.declarations)
          ) {
            for (const d of declaration.declarations) {
              if (isRecord(d)) check(d.id, node);
            }
          }
        }
        for (const spec of node.specifiers ?? []) {
          if (isRecord(spec)) check(spec.exported, node);
        }
      },
      /** @param {{ declaration?: unknown } & Located} node */
      ExportDefaultDeclaration(node) {
        const { declaration } = node;
        if (
          isRecord(declaration) &&
          (declaration.type === "FunctionDeclaration" ||
            declaration.type === "ClassDeclaration")
        ) {
          check(declaration.id, node);
        }
      },
    };
  },
};
