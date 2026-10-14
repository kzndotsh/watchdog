import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import { propertyName } from "../lib/effect-calls.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const MOCK_METHODS = new Set(["mock", "doMock"]);

/**
 * Internal modules that are still a test boundary: the web server-function modules (the
 * network edge of the app), the Better Auth client and server wrappers, and the toast
 * module (its shared double lives in `apps/web/src/testing/`).
 */
const BOUNDARY_SPECIFIER =
  /(?:\.functions(?:\.ts)?$)|^@\/auth\/(?:client|server)$|^@\/shared\/ui\/toast$/;

/**
 * The module specifier of a `vi.mock` / `vi.doMock` call when it is statically known.
 * @param {Record<string, unknown>} node
 * @returns {string | null}
 */
const mockedSpecifier = (node) => {
  const { callee } = node;
  if (
    !isRecord(callee) ||
    callee.type !== "MemberExpression" ||
    !isRecord(callee.object) ||
    callee.object.type !== "Identifier" ||
    callee.object.name !== "vi"
  ) {
    return null;
  }
  const method = propertyName(callee);
  if (method === null || !MOCK_METHODS.has(method)) return null;
  /** @type {readonly unknown[]} */
  const args = Array.isArray(node.arguments) ? node.arguments : [];
  const first = args[0];
  if (!isRecord(first)) return null;
  if (first.type === "Literal" && typeof first.value === "string") {
    return first.value;
  }
  if (
    first.type === "TemplateLiteral" &&
    Array.isArray(first.expressions) &&
    first.expressions.length === 0 &&
    Array.isArray(first.quasis)
  ) {
    /** @type {readonly unknown[]} */
    const quasis = first.quasis;
    const [quasi] = quasis;
    if (isRecord(quasi) && isRecord(quasi.value)) {
      return typeof quasi.value.cooked === "string" ? quasi.value.cooked : null;
    }
  }
  return null;
};

/**
 * A relative (`./x`, `../x`) or `@/` alias specifier is a module of this repo.
 * @param {string} specifier
 */
const isInternal = (specifier) =>
  specifier.startsWith("./") ||
  specifier.startsWith("../") ||
  specifier.startsWith("@/");

/**
 * Bans `vi.mock` / `vi.doMock` of an internal module (a relative or `@/` specifier) in
 * tests: a mock of code the repo owns lets a refactor break the wiring while the test
 * stays green. Boundaries stay legal: `*.functions` modules, `@/auth/client`,
 * `@/auth/server` and `@/shared/ui/toast`. Packages (`@watchdog/*`, vendor libraries,
 * `node:`) are not internal here. Existing mocks are baselined per file (shrink-only).
 * Policy: docs/contributing/testing/standards.md Mock policy.
 */
export const noInternalModuleMock = withBaseline("no-internal-module-mock", {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban vi.mock of an internal module (relative or @/ specifier) in tests; mock boundaries only.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {Record<string, unknown>} node */
      CallExpression(node) {
        const specifier = mockedSpecifier(node);
        if (
          specifier === null ||
          !isInternal(specifier) ||
          BOUNDARY_SPECIFIER.test(specifier)
        ) {
          return;
        }
        context.report({
          node,
          message: `vi.mock of the internal module "${specifier}": run the real module and fake the boundary it calls (a \`*.functions\` module, the network through MSW, the clock), or lift the test a tier (conventions: mock boundaries, not internal modules; docs/contributing/testing/standards.md Mock policy)`,
        });
      },
    };
  },
});
