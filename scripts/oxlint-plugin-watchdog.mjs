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

export default {
  meta: { name: "watchdog" },
  rules: {
    "no-core-db-dynamic-import": noCoreDbDynamicImport,
    "no-core-s3-dynamic-import": noCoreS3DynamicImport,
  },
};
