import type { ArgsDef, CommandDef, CommandMeta, SubCommandsDef } from "citty";
import { defineCommand } from "citty";

import { fail, formatArgs } from "./io";

export { formatArgs } from "./io";

/** Shared `--dry-run` — prints planned payload only; does not call the API. */
export const dryRunArg = {
  "dry-run": {
    type: "boolean" as const,
    description: "Print planned action JSON without calling the API",
    default: false,
  },
} as const;

export const caseArg = {
  case: {
    type: "string" as const,
    alias: "c",
    description: "Case ID",
  },
} as const;

export const entityArg = {
  entity: {
    type: "string" as const,
    alias: "e",
    description: "Entity slug or UUID",
  },
} as const;

export const requiredCaseArg = {
  case: { ...caseArg.case, required: true },
} as const;

export const requiredEntityArg = {
  entity: { ...entityArg.entity, required: true },
} as const;

/** Narrow a `list` handler's untyped boolean flag (e.g. `--table`) safely. */
export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Drop empty/undefined string fields when building API patches. */
export function pickDefined(
  input: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value === "string" && value === "") continue;
    out[key] = value;
  }
  return out;
}

function flagLabel(key: string): string {
  return `--${key}`;
}

function requireArgs(
  args: Record<string, unknown>,
  keys: string[],
  help: string[]
): void {
  for (const key of keys) {
    const value = args[key];
    if (value === undefined || value === "") {
      fail("USAGE", `Missing required ${flagLabel(key)}`, { help });
    }
  }
}

function withRequired(args: ArgsDef, keys: string[]): ArgsDef {
  const next: ArgsDef = { ...args };
  for (const key of keys) {
    const def = next[key];
    if (def === undefined || def.type === "positional") continue;
    next[key] = { ...def, required: true };
  }
  return next;
}

/**
 * Content-first noun: bare `wd <noun> …` runs the same list handler as
 * `wd <noun> list …` with identical args (+ format flags).
 */
export function defineNounCommand(input: {
  meta: CommandMeta;
  /** List filters (without formatArgs — factory merges them). */
  listArgs: ArgsDef;
  /** Keys that must be present for content-first / list. */
  required: string[];
  usageHelp: string[];
  list: (args: Record<string, unknown>) => void | Promise<void>;
  mutations?: SubCommandsDef;
}): CommandDef {
  const listArgs: ArgsDef = { ...input.listArgs, ...formatArgs };
  const listArgsRequired = withRequired(listArgs, input.required);

  return defineCommand({
    meta: input.meta,
    args: listArgs,
    run: async ({ args }) => {
      requireArgs(args, input.required, input.usageHelp);
      await input.list(args);
    },
    subCommands: {
      list: defineCommand({
        meta: {
          name: "list",
          description: `List ${input.meta.name ?? "items"}`,
        },
        args: listArgsRequired,
        run: async ({ args }) => {
          await input.list(args);
        },
      }),
      ...input.mutations,
    },
  });
}
