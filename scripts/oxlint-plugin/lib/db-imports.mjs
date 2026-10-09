/**
 * Import bindings of a module, collected from `Program.body` before any rule judges a
 * reference (imports are hoisted, so a use may precede its import in source order).
 */
import { isRecord } from "./ast.mjs";

/**
 * True for `drizzle-orm` and its subpaths.
 * @param {string} source
 */
export const isDrizzleModule = (source) =>
  source === "drizzle-orm" || source.startsWith("drizzle-orm/");

/**
 * `named` maps an imported name to its local names; `namespaces` holds `* as ns` locals
 * of matching modules; `others` holds every local bound by an import from another module.
 * @param {unknown} program
 * @param {(source: string) => boolean} isModule
 */
export const collectImports = (program, isModule) => {
  /** @type {Map<string, Set<string>>} */
  const named = new Map();
  /** @type {Set<string>} */
  const namespaces = new Set();
  /** @type {Set<string>} */
  const others = new Set();
  const body =
    isRecord(program) && Array.isArray(program.body) ? program.body : [];
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== "ImportDeclaration") continue;
    const from =
      isRecord(stmt.source) && typeof stmt.source.value === "string"
        ? stmt.source.value
        : "";
    const mine = isModule(from);
    const specifiers = Array.isArray(stmt.specifiers) ? stmt.specifiers : [];
    for (const spec of specifiers) {
      if (!isRecord(spec) || !isRecord(spec.local)) continue;
      const local = spec.local.name;
      if (typeof local !== "string") continue;
      if (!mine) {
        others.add(local);
      } else if (spec.type === "ImportNamespaceSpecifier") {
        namespaces.add(local);
      } else if (spec.type === "ImportSpecifier" && isRecord(spec.imported)) {
        const imported = spec.imported.name ?? spec.imported.value;
        if (typeof imported === "string") {
          const set = named.get(imported) ?? new Set();
          set.add(local);
          named.set(imported, set);
        }
      }
    }
  }
  return { named, namespaces, others };
};
