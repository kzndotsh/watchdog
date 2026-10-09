import { isRecord, SKIP_KEYS, typeNameOf } from "../lib/ast.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/** Branded id types (ADR-0003) that may only be minted by validating constructors. */
const BRANDED_ID_TYPES = new Set(["OrganizationId", "CaseId"]);

/** Zod brand marker: `string & z.BRAND<"CaseId">` stamps the same brand without the alias. */
const BRAND_MARKER = "BRAND";

/**
 * The brand named by a `BRAND<"CaseId">` reference's type arguments, if any.
 * @param {Record<string, unknown>} ref
 * @returns {string | null}
 */
const brandFromMarker = (ref) => {
  const args = ref.typeArguments ?? ref.typeParameters;
  if (!isRecord(args) || !Array.isArray(args.params)) return null;
  for (const arg of args.params) {
    if (!isRecord(arg) || arg.type !== "TSLiteralType") continue;
    const { literal } = arg;
    if (
      isRecord(literal) &&
      typeof literal.value === "string" &&
      BRANDED_ID_TYPES.has(literal.value)
    ) {
      return literal.value;
    }
  }
  return null;
};

/**
 * Finds the first branded-id mention anywhere inside an asserted type: a reference to
 * `CaseId` / `OrganizationId` (or a local alias of them) at any depth (`CaseId | null`,
 * `CaseId[]`, `Record<string, CaseId>`, `{ id: CaseId }`, tuples, `readonly CaseId[]`),
 * or a `BRAND<"CaseId">` marker.
 * @param {unknown} node
 * @param {ReadonlySet<string>} names
 * @returns {string | null}
 */
const findBrand = (node, names) => {
  if (!isRecord(node)) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findBrand(item, names);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (node.type === "TSTypeReference") {
    const name = typeNameOf(node.typeName);
    if (name !== null && names.has(name)) return name;
    if (name === BRAND_MARKER) {
      const hit = brandFromMarker(node);
      if (hit !== null) return hit;
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const hit = findBrand(value, names);
    if (hit !== null) return hit;
  }
  return null;
};

/**
 * Bans any cast whose asserted type mentions a branded id: `x as OrganizationId`,
 * `as CaseId | null`, `as CaseId[]`, `as Record<string, CaseId>`, `as { id: CaseId }`,
 * `as string & z.BRAND<"CaseId">`, `x as unknown as <any of those>` and `<CaseId>x`. A
 * branded id is minted by `asOrganizationId` / `asCaseId` (or a schema parse), never
 * stamped on a string. oxlint has no `no-restricted-syntax`, so this is a plugin rule on
 * the two cast nodes. An aliased import (`import { CaseId as C }`) is followed within its
 * own file. Limitation: an alias declared elsewhere (`type Id = CaseId; x as Id`) is not
 * resolved, and `satisfies` / annotations are not casts and stay legal.
 */
export const noBrandCast = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban casts whose asserted type mentions OrganizationId / CaseId; mint through the validating constructors.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    const names = new Set(BRANDED_ID_TYPES);
    /** @param {{ typeAnnotation: unknown }} node */
    const check = (node) => {
      const hit = findBrand(node.typeAnnotation, names);
      if (hit !== null) {
        context.report({
          node,
          message: `Do not cast to a type containing ${hit}: mint it with asOrganizationId / asCaseId (or parse with the id schema) from @watchdog/schemas/shared. Only the branded test fixtures in packages/schemas/src/testing are exempt (ADR-0003).`,
        });
      }
    };
    return {
      /** @param {{ specifiers: readonly unknown[] }} node */
      ImportDeclaration(node) {
        for (const spec of node.specifiers) {
          if (!isRecord(spec) || spec.type !== "ImportSpecifier") continue;
          const imported = typeNameOf(spec.imported);
          const local = typeNameOf(spec.local);
          if (
            imported !== null &&
            local !== null &&
            BRANDED_ID_TYPES.has(imported)
          ) {
            names.add(local);
          }
        }
      },
      TSAsExpression: check,
      TSTypeAssertion: check,
    };
  },
};
