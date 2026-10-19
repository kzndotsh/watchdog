import { fail } from "./client";

/**
 * `--expected-version` on every Graph update verb (#307): the row's `version` as an earlier read
 * returned it. The update applies only if the row is still at that version; otherwise it fails
 * with `stale_version` and nothing is written. Left out, the verb reads the row's current version
 * first, which only protects the gap between that read and the write.
 */
export const expectedVersionArg = {
  "expected-version": {
    type: "string" as const,
    description:
      "Row version from a prior read (`version`); stale_version if it changed. Read now when omitted",
  },
} as const;

/** A positive integer, or a clean `USAGE` error; `undefined` when the flag was not passed. */
export function parseExpectedVersion(
  raw: unknown,
  help: string[]
): number | undefined {
  if (raw === undefined) return undefined;
  const text = typeof raw === "string" ? raw.trim() : "";
  const value = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("USAGE", "--expected-version must be a positive integer", { help });
  }
  return value;
}

/**
 * The version an update sends: the flag when given, else what `read` returns (`undefined` there
 * means the row does not exist). A noun that cannot be read without an entity passes `read: null`
 * and the verb then needs the flag.
 */
export async function resolveExpectedVersion(opts: {
  given: unknown;
  noun: string;
  id: string;
  help: string[];
  read: (() => Promise<number | undefined>) | null;
}): Promise<number> {
  const given = parseExpectedVersion(opts.given, opts.help);
  if (given !== undefined) return given;
  if (opts.read === null) {
    fail(
      "USAGE",
      `Pass --expected-version <n> (the \`version\` from the list output) or --entity <slug> to read it`,
      { help: opts.help }
    );
  }
  const current = await opts.read();
  if (current === undefined) {
    fail("not_found", `${opts.noun} not found: ${opts.id}`, {
      help: opts.help,
    });
  }
  return current;
}
