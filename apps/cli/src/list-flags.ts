import type { ArgsDef } from "citty";

import {
  assertNeverFilter,
  LIST_SEARCH_MIN_LENGTH,
  opsOf,
  parseTrimmedUuid,
} from "@watchdog/schemas/shared";
import type {
  AnyFilter,
  AnyListDef,
  CaseId,
  ListInput,
  RefFilter,
} from "@watchdog/schemas/shared";

import { fail } from "./client";
import { resolveEntityId } from "./ids";

/**
 * The CLI flags of a declared list (ADR-0007), derived from the declaration alone, so a list
 * gains a flag by gaining a filter:
 *
 *   flag      --hidden                    true-only: present or absent, no --no-hidden
 *   choices   --kind file,other           one or more of the vocabulary, comma-separated
 *   ref       --entity-id <uuid|slug>     the key in kebab-case; an `entity` ref also takes a slug
 *   tags      --capability-id a,b         comma-separated
 *   q         --search <text>             only when the list declares `search`; 1 or 2
 *                                         characters is a USAGE error, never a silent drop
 *   sort      --sort captured.asc         one of the declared sort values
 *
 * Descriptions are the declaration's labels. Paging (`--limit`, `--cursor`, `--all`) comes from
 * `pageArgs` through `defineNounCommand`.
 */

/** `entityId` → `entity-id`: the flag of a filter key. */
function flagName(key: string): string {
  return key.replaceAll(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function refHint(filter: RefFilter): string {
  return filter.refers === "entity" ? "UUID or slug" : "UUID";
}

/** One filter's flag, by kind. */
function filterFlag(filter: AnyFilter): ArgsDef[string] {
  switch (filter.kind) {
    case "flag": {
      return { type: "boolean", description: `Only ${filter.label}` };
    }
    case "choices": {
      return {
        type: "string",
        description: `${filter.label}: ${filter.values.join(", ")} (comma-separated)`,
      };
    }
    case "ref": {
      return {
        type: "string",
        description: `${filter.label} (${refHint(filter)})`,
      };
    }
    case "tags": {
      return {
        type: "string",
        description: `${filter.label} (comma-separated)`,
      };
    }
    default: {
      return assertNeverFilter(filter);
    }
  }
}

/** The declared sort values, in declaration order (`captured.desc`, `captured.asc`, ...). */
function sortValuesOf(def: AnyListDef): string[] {
  return Object.entries(def.sorts).flatMap(([key, sort]) =>
    sort.dirs.map((dir) => `${key}.${dir}`)
  );
}

export function listFlags(def: AnyListDef): ArgsDef {
  const args: ArgsDef = {};
  for (const [key, filter] of Object.entries(def.filters)) {
    args[flagName(key)] = filterFlag(filter);
  }
  if (def.search !== undefined) {
    args.search = {
      type: "string",
      description: `Search ${def.search.hint} (${LIST_SEARCH_MIN_LENGTH}+ characters)`,
    };
  }
  args.sort = {
    type: "string",
    description: `One of: ${sortValuesOf(def).join(", ")} (default ${def.defaultSort})`,
  };
  return args;
}

/** The flag that carries an input key, for error messages. */
function flagOfParam(def: AnyListDef, param: unknown): string {
  if (param === "q") return "--search";
  if (typeof param === "string" && param in def.filters) {
    return `--${flagName(param)}`;
  }
  return typeof param === "string" ? `--${param}` : "list flags";
}

/** A string flag's text, or undefined when it was not passed. */
function textArg(
  args: Record<string, unknown>,
  name: string
): string | undefined {
  const raw = args[name];
  return typeof raw === "string" ? raw : undefined;
}

async function refValue(
  filter: RefFilter,
  flag: string,
  text: string,
  caseId: CaseId | undefined
): Promise<string> {
  const parsed = filter.cli.safeParse(text);
  if (!parsed.success || typeof parsed.data !== "string") {
    return fail("USAGE", `${flag} needs a ${refHint(filter)}`);
  }
  const uuid = parseTrimmedUuid(parsed.data);
  if (uuid !== null) return uuid;
  if (filter.refers === "entity" && caseId !== undefined) {
    return resolveEntityId(caseId, parsed.data);
  }
  return fail("USAGE", `${flag} must be a valid UUID`);
}

/** One filter's wire value from argv, by kind; undefined when the flag was not passed. */
async function filterValue(
  filter: AnyFilter,
  name: string,
  args: Record<string, unknown>,
  caseId: CaseId | undefined
): Promise<unknown> {
  const flag = `--${name}`;
  switch (filter.kind) {
    case "flag": {
      return args[name] === true ? true : undefined;
    }
    case "choices":
    case "tags": {
      const text = textArg(args, name);
      if (text === undefined) return undefined;
      const parsed = filter.cli.safeParse(text);
      if (!parsed.success) {
        return fail(
          "USAGE",
          `${flag}: ${parsed.error.issues[0]?.message ?? "invalid value"}`
        );
      }
      return Array.isArray(parsed.data) && parsed.data.length > 0
        ? parsed.data
        : undefined;
    }
    case "ref": {
      const text = textArg(args, name);
      return text === undefined
        ? undefined
        : refValue(filter, flag, text, caseId);
    }
    default: {
      return assertNeverFilter(filter);
    }
  }
}

/**
 * argv to the list's input, without `cursor` and `limit` (`fetchListPage` adds them): each filter
 * through its kind's CLI parser, an Entity slug resolved to its id, then `def.input` for the
 * search length, the sort and the exclusive pairs. Any refusal is `fail("USAGE", ...)` naming the
 * flag, the same rule the API would answer with a 400.
 */
export async function listInputFromFlags<Def extends AnyListDef>(
  def: Def,
  scope: { readonly caseId?: CaseId },
  args: Record<string, unknown>
): Promise<Omit<ListInput<Def>, "cursor" | "limit">> {
  const wire: Record<string, unknown> = { ...scope };
  for (const [key, filter] of Object.entries(def.filters)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- at most one slug lookup, in flag order
    const value = await filterValue(filter, flagName(key), args, scope.caseId);
    if (value !== undefined) wire[key] = value;
  }
  const search = textArg(args, "search");
  if (search !== undefined) {
    if (def.search === undefined) {
      fail("USAGE", `wd ${def.name} list takes no --search`);
    }
    wire.q = search;
  }
  const sort = textArg(args, "sort");
  if (sort !== undefined) wire.sort = sort.trim();

  const parsed = opsOf(def).input.safeParse(wire);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(
      "USAGE",
      `${flagOfParam(def, issue?.path[0])}: ${issue?.message ?? "invalid value"}`
    );
  }
  const { cursor: _cursor, limit: _limit, ...input } = parsed.data;
  return input;
}
