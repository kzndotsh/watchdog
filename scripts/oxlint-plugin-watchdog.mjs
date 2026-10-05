/**
 * Local oxlint JS plugin: rules oxlint has no built-in for (it ships no
 * `no-restricted-syntax`). Loaded from `oxlint.config.ts` `jsPlugins`.
 */

const DB_PACKAGE = "@watchdog/db";
const S3_PACKAGE = "@aws-sdk/client-s3";

/**
 * @typedef {{ source: { type: string, value?: unknown } }} ImportExpressionNode
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

/**
 * A rule banning `import("<specifier>")`, which `no-restricted-imports` misses.
 * @param {string} specifier
 * @param {string} description
 * @param {string} message
 */
const bansDynamicImport = (specifier, description, message) => ({
  meta: { type: "problem", docs: { description } },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {ImportExpressionNode} node */
      ImportExpression(node) {
        if (node.source.type === "Literal" && node.source.value === specifier) {
          context.report({ node, message });
        }
      },
    };
  },
});

const noCoreDbDynamicImport = bansDynamicImport(
  DB_PACKAGE,
  "Ban `import('@watchdog/db')`, which bypasses the static global-db import ban.",
  "Core reads the database through the Db service (tryDbWith / transact, see packages/core/AGENTS.md); a dynamic import of @watchdog/db bypasses the global-db ban."
);

const noCoreS3DynamicImport = bansDynamicImport(
  S3_PACKAGE,
  "Ban `import('@aws-sdk/client-s3')`, which bypasses the static S3Client import ban.",
  "Core reads the S3 client from the BlobStore service (infra/blob-store.ts, see packages/core/AGENTS.md); a dynamic import of @aws-sdk/client-s3 bypasses the S3Client ban."
);

/** Branded id types (ADR-0003) that may only be minted by validating constructors. */
const BRANDED_ID_TYPES = new Set(["OrganizationId", "CaseId"]);

/** Zod brand marker: `string & z.BRAND<"CaseId">` stamps the same brand without the alias. */
const BRAND_MARKER = "BRAND";

/** AST keys that point back up or carry positions, never walked. */
const SKIP_KEYS = new Set(["parent", "loc", "range", "start", "end"]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => typeof value === "object" && value !== null;

/**
 * Last identifier of a type name (`CaseId`, or `BRAND` in `z.BRAND`).
 * @param {unknown} name
 * @returns {string | null}
 */
const typeNameOf = (name) => {
  if (!isRecord(name)) return null;
  if (name.type === "Identifier" && typeof name.name === "string") {
    return name.name;
  }
  if (name.type === "TSQualifiedName") return typeNameOf(name.right);
  return null;
};

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
const noBrandCast = {
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
          message: `Do not cast to a type containing ${hit}: mint it with asOrganizationId / asCaseId (or parse with the id schema) from @watchdog/schemas/shared. Only packages/test-kit fixtures are exempt (ADR-0003).`,
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

/** Test-kit helpers that stamp a brand without validating (ADR-0003). */
const UNTRUSTED_ID_HELPERS = new Set([
  "untrustedCaseId",
  "untrustedOrganizationId",
]);

/**
 * Bans importing (or re-exporting) `untrustedCaseId` / `untrustedOrganizationId` from
 * `@watchdog/test-kit`. They stamp a brand on unvalidated text so tests can feed
 * malformed ids to code that must reject them; production code could use them to
 * bypass the validating constructors. Allowed trees are exempted in `oxlint.config.ts`.
 */
const noUntrustedIdImport = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban importing untrustedCaseId / untrustedOrganizationId outside tests and test helpers.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    /** @param {{ source?: unknown, specifiers?: readonly unknown[] }} node */
    const check = (node) => {
      const { source } = node;
      if (
        !isRecord(source) ||
        typeof source.value !== "string" ||
        !(
          source.value.startsWith("@watchdog/test-kit") ||
          source.value === "@watchdog/schemas/testing"
        )
      ) {
        return;
      }
      for (const spec of node.specifiers ?? []) {
        if (!isRecord(spec)) continue;
        const name = typeNameOf(spec.imported ?? spec.local);
        if (name !== null && UNTRUSTED_ID_HELPERS.has(name)) {
          context.report({
            node: spec,
            message: `${name} stamps an unvalidated brand and is for tests only: mint ids with asCaseId / asOrganizationId or a schema parse (ADR-0003). Allowed in __tests__, *.test.ts, packages/test-kit, testing/ and packages/test-db/src.`,
          });
        }
      }
    };
    return { ImportDeclaration: check, ExportNamedDeclaration: check };
  },
};

export default {
  meta: { name: "watchdog" },
  rules: {
    "no-core-db-dynamic-import": noCoreDbDynamicImport,
    "no-core-s3-dynamic-import": noCoreS3DynamicImport,
    "no-brand-cast": noBrandCast,
    "no-untrusted-id-import": noUntrustedIdImport,
  },
};
