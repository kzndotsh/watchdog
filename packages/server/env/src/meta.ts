/**
 * Metadata every env field carries (Zod `.meta()`, so parsed types do not
 * change). `scripts/generate-env-docs.mjs` reads it to write `env.example` and
 * the configuration reference; `pnpm check:env` fails when either is stale.
 */

/** Which entrypoint reads a variable. `migrate` is the container's `migrate.mjs`. */
const ENTRYPOINTS = ["web", "worker", "cli", "migrate", "site"] as const;

export type EnvEntrypoint = (typeof ENTRYPOINTS)[number];

export type EnvFieldMeta = {
  /** What the variable does, one or two sentences. Required for every field. */
  readonly description: string;
  /** Secret or credential-bearing: written blank in `env.example`, never logged. */
  readonly sensitive: boolean;
  /** Entrypoints that read it. */
  readonly usedBy: readonly EnvEntrypoint[];
  /** Local-development value written to `env.example` for a non-sensitive field. */
  readonly example?: string;
};

function isEntrypoint(value: unknown): value is EnvEntrypoint {
  return ENTRYPOINTS.some((entrypoint) => entrypoint === value);
}

/**
 * Reads the metadata back from a field's Zod registry entry (typed `unknown`: Zod's
 * `GlobalMeta` takes any key). Returns `undefined` for a field that lacks any part of it.
 */
export function readFieldMeta(
  meta: Readonly<Record<string, unknown>> | undefined
): EnvFieldMeta | undefined {
  if (
    typeof meta?.description !== "string" ||
    typeof meta.sensitive !== "boolean" ||
    !Array.isArray(meta.usedBy)
  ) {
    return undefined;
  }
  return {
    description: meta.description,
    sensitive: meta.sensitive,
    usedBy: meta.usedBy.filter(isEntrypoint),
    example: typeof meta.example === "string" ? meta.example : undefined,
  };
}
