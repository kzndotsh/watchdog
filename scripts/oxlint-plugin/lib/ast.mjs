/**
 * AST helpers shared by the rule modules. Nodes are plain objects from oxlint's
 * ESTree-compatible parser; these helpers narrow them without a type dependency.
 */

/** AST keys that point back up or carry positions, never walked. */
export const SKIP_KEYS = new Set(["parent", "loc", "range", "start", "end"]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export const isRecord = (value) => typeof value === "object" && value !== null;

/**
 * Last identifier of a type name (`CaseId`, or `BRAND` in `z.BRAND`).
 * @param {unknown} name
 * @returns {string | null}
 */
export const typeNameOf = (name) => {
  if (!isRecord(name)) return null;
  if (name.type === "Identifier" && typeof name.name === "string") {
    return name.name;
  }
  if (name.type === "TSQualifiedName") return typeNameOf(name.right);
  return null;
};
