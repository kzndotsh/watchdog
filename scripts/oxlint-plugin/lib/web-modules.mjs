/**
 * Module-specifier helpers for the apps/web layering rules: every way a file can name
 * another module, and resolution of a specifier to a path under `apps/web/src`.
 */
import path from "node:path";

import { isRecord } from "./ast.mjs";

const SRC_MARKER = "apps/web/src/";

/**
 * Path of `filename` relative to `apps/web/src` (forward slashes), or null outside it.
 * @param {string} filename
 * @returns {string | null}
 */
export const webSrcPath = (filename) => {
  const file = filename.replaceAll("\\", "/");
  const at = file.startsWith(SRC_MARKER) ? 0 : file.indexOf(`/${SRC_MARKER}`);
  if (at < 0) return null;
  const start = at === 0 ? 0 : at + 1;
  return file.slice(start + SRC_MARKER.length);
};

/**
 * Where a web import points, relative to `apps/web/src`: `@/x` is `x`, `./x` and `../x`
 * resolve against the importing file (a result starting `../` leaves `src`). Package
 * specifiers return null.
 * @param {string} fileRel importing file, relative to `apps/web/src`
 * @param {string} specifier
 * @returns {string | null}
 */
export const resolveWebSpecifier = (fileRel, specifier) => {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return path.posix.join(path.posix.dirname(fileRel), specifier);
  }
  return null;
};

/**
 * A string literal's value, or a template literal without substitutions.
 * @param {unknown} node
 * @returns {string | null}
 */
export const literalString = (node) => {
  if (!isRecord(node)) return null;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (
    node.type === "TemplateLiteral" &&
    Array.isArray(node.expressions) &&
    node.expressions.length === 0 &&
    Array.isArray(node.quasis) &&
    isRecord(node.quasis[0]) &&
    isRecord(node.quasis[0].value) &&
    typeof node.quasis[0].value.cooked === "string"
  ) {
    return node.quasis[0].value.cooked;
  }
  return null;
};

/**
 * Module specifier of an `import("x")` type node (`source` in oxc, `argument` in
 * typescript-estree, optionally wrapped in a literal type).
 * @param {unknown} node
 * @returns {string | null}
 */
export const importTypeSource = (node) => {
  if (!isRecord(node)) return null;
  const arg = node.source ?? node.argument;
  return literalString(isRecord(arg) ? (arg.literal ?? arg) : arg);
};

/**
 * Visitors that call `onSource(specifier, node)` for every static module reference:
 * `import`/`export ... from`, `import()`, `require()`, `import x = require()` and
 * `import("x").T` types.
 * @param {(specifier: string, node: unknown) => void} onSource
 */
export const moduleSourceVisitors = (onSource) => {
  /** @param {{ source?: unknown }} node */
  const fromSource = (node) => {
    const value = literalString(node.source);
    if (value !== null) onSource(value, node);
  };
  return {
    ImportDeclaration: fromSource,
    ExportNamedDeclaration: fromSource,
    ExportAllDeclaration: fromSource,
    ImportExpression: fromSource,
    /** @param {{ callee?: unknown, arguments?: readonly unknown[] }} node */
    CallExpression(node) {
      const { callee } = node;
      if (
        isRecord(callee) &&
        callee.type === "Identifier" &&
        callee.name === "require"
      ) {
        const value = literalString(node.arguments?.[0]);
        if (value !== null) onSource(value, node);
      }
    },
    /** @param {{ moduleReference?: unknown }} node */
    TSImportEqualsDeclaration(node) {
      const ref = node.moduleReference;
      if (isRecord(ref) && ref.type === "TSExternalModuleReference") {
        const value = literalString(ref.expression);
        if (value !== null) onSource(value, node);
      }
    },
    /** @param {unknown} node */
    TSImportType(node) {
      const value = importTypeSource(node);
      if (value !== null) onSource(value, node);
    },
  };
};
