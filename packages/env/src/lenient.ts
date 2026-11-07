import type { z } from "zod";

type Fields = Record<string, z.ZodType>;
type Source = Record<string, string | undefined>;

/**
 * The environment when validation is skipped (`SKIP_ENV_VALIDATION=1`: lint, unit tests, a
 * Docker build without secrets). Each field is parsed when it is read, so an unset field still
 * carries its schema default and code never restates one; a value the schema rejects is handed
 * back as written instead of throwing. Reads go to `source` every time, so a later change (a
 * test's `vi.stubEnv`) is seen.
 */
export function lenientEnv<F extends Fields>(
  fields: F,
  source: Source
): { [K in keyof F]: z.output<F[K]> } {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every read below parses the field with its own schema, so each key holds that schema's output (or the raw value validation would have refused)
  return new Proxy({} as { [K in keyof F]: z.output<F[K]> }, {
    get(target, name) {
      if (typeof name !== "string") return Reflect.get(target, name);
      const raw = source[name] === "" ? undefined : source[name];
      const schema = Object.hasOwn(fields, name) ? fields[name] : undefined;
      if (schema === undefined) return raw;
      const parsed = schema.safeParse(raw);
      return parsed.success ? parsed.data : raw;
    },
  });
}
