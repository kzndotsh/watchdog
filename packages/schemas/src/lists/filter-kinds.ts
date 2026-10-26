import { z } from "zod";

import { ARRAY_MAX, NAME_MAX, NOTES_MAX } from "../limits";
import { trimmedUuidSchema } from "../primitives";

/**
 * The closed set of four filter kinds a list can declare (ADR-0007). Every surface interprets
 * KINDS, never lists: the wire, URL and CLI schemas and the canonical form here; the SQL
 * predicate in `@watchdog/db`; the row control in web's Filters popover. Each of those is one
 * exhaustive `switch (filter.kind)` ending in `assertNeverFilter`, so a fifth kind fails
 * typecheck in every interpreter until it is handled. No operators, no nesting, no defaults.
 *
 * Variance: a filter's runtime pieces (`wire`, `url`, `cli`) are ERASED (`z.ZodType`) and
 * nothing on a filter takes its value as a parameter. The value type is recovered from the
 * discriminant and the literal `values` tuple (`QueryValue` / `WireValue`), so every concrete
 * filter is covariant and assignable to `AnyFilter`, which `ListDecl` constrains with.
 */

type FilterCommon<K extends string> = {
  readonly kind: K;
  /** Title Case noun: the Filters popover's field select, the chip, CLI help, OpenAPI description. */
  readonly label: string;
  /** The API param, bounded per `watchdog/bounded-input-schema`. Erased on purpose. */
  readonly wire: z.ZodType;
  /** The route search param: the wire schema with a bad value dropped (`urlParam`). */
  readonly url: z.ZodType;
  /** argv text (`--kind file,other`, `--hidden`) to the wire value. Erased on purpose. */
  readonly cli: z.ZodType;
};

/**
 * TRUE-ONLY: "on, or absent". The wire takes `true` or nothing, the URL holds `?hidden=true` or
 * nothing, the CLI has `--hidden` and no `--no-hidden`. In a canonical query the value is a
 * `boolean` (absent = false) so predicates read naturally.
 */
export type FlagFilter = FilterCommon<"flag">;

/**
 * Any of a closed vocabulary (`kind IN (...)`). No default: absent means "no filter", which
 * means everything. A screen that opens pre-filtered links with the filter in the URL.
 */
export type ChoicesFilter<T extends string = string> =
  FilterCommon<"choices"> & {
    readonly values: readonly [T, ...T[]];
    /** The vocabulary's labels from `display-labels.ts`; never a copy. */
    readonly optionLabels: Readonly<Record<T, string>>;
  };

/** One row of another list, by id (`entityId`); the Filters popover shows a picker fed by the screen. */
export type RefFilter = FilterCommon<"ref"> & {
  /** What the id names: the picker to show, and how the CLI resolves a slug to an id. */
  readonly refers: "entity" | "evidence" | "job" | "playbook-run";
};

/** Any of an open vocabulary (Cap ids); options come from the screen at runtime. */
export type TagsFilter = FilterCommon<"tags"> & {
  readonly maxLength: number;
};

/** The erased constraint every generic piece uses. */
export type AnyFilter = FlagFilter | ChoicesFilter | RefFilter | TagsFilter;

/** A filter's value inside a canonical `ListQuery` (what db predicates receive). */
export type QueryValue<F> = F extends { readonly kind: "flag" }
  ? boolean
  : F extends ChoicesFilter<infer T>
    ? readonly T[]
    : F extends { readonly kind: "ref" }
      ? string | null
      : F extends { readonly kind: "tags" }
        ? readonly string[]
        : never;

/** A filter's value on the wire, in the URL and after CLI parsing (absent = not filtering). */
export type WireValue<F> = F extends { readonly kind: "flag" }
  ? true
  : F extends ChoicesFilter<infer T>
    ? readonly T[]
    : F extends { readonly kind: "ref" }
      ? string
      : F extends { readonly kind: "tags" }
        ? readonly string[]
        : never;

/** Kinds whose options the screen must supply to the Filters popover. */
export type RuntimeOptionKind = RefFilter | TagsFilter;

const dropped = (): undefined => undefined;

/** A route search param: a value that does not parse is dropped, never an error page. */
export function urlParam<T extends z.ZodType>(schema: z.ZodOptional<T>) {
  return schema.catch(dropped);
}

/** CLI list text: `file, other` → `["file", "other"]`. */
function splitComma(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export function flag(label: string): FlagFilter {
  // citty hands a boolean flag over as `true` or `undefined`, so the CLI takes the wire schema.
  const wire = z.literal(true).optional().describe(label);
  return { kind: "flag", label, wire, url: urlParam(wire), cli: wire };
}

export function choices<const T extends string>(
  label: string,
  values: readonly [T, ...T[]],
  optionLabels: Readonly<Record<T, string>>
): ChoicesFilter<T> {
  const list = z.array(z.enum(values)).max(values.length);
  const wire = list.optional().describe(label);
  const cli = z.string().max(NAME_MAX).transform(splitComma).pipe(list);
  return {
    kind: "choices",
    label,
    values,
    optionLabels,
    wire,
    url: urlParam(wire),
    cli,
  };
}

export function ref(label: string, refers: RefFilter["refers"]): RefFilter {
  // A plain uuid, never a CaseId brand (ADR-0003).
  const wire = trimmedUuidSchema.optional().describe(label);
  // The CLI also takes an Entity slug; the command resolves it to an id before it sends.
  const cli = z.string().trim().min(1).max(NAME_MAX);
  return { kind: "ref", label, refers, wire, url: urlParam(wire), cli };
}

export function tags(
  label: string,
  opts: { readonly maxLength: number }
): TagsFilter {
  const list = z
    .array(z.string().trim().min(1).max(opts.maxLength))
    .max(ARRAY_MAX);
  const wire = list.optional().describe(label);
  const cli = z.string().max(NOTES_MAX).transform(splitComma).pipe(list);
  return {
    kind: "tags",
    label,
    maxLength: opts.maxLength,
    wire,
    url: urlParam(wire),
    cli,
  };
}

/** For the interpreters' exhaustive switches. */
export function assertNeverFilter(filter: never): never {
  throw new Error(`Unhandled filter kind: ${JSON.stringify(filter)}`);
}

/** The canonical "not filtering" value of a kind. */
export function emptyFilterValue(filter: AnyFilter): unknown {
  switch (filter.kind) {
    case "flag": {
      return false;
    }
    case "ref": {
      return null;
    }
    case "choices":
    case "tags": {
      return [];
    }
    default: {
      return assertNeverFilter(filter);
    }
  }
}

/**
 * A wire, URL or query value to its canonical form: a flag is `true` only when set; choices
 * are deduplicated in vocabulary order; a ref is trimmed (blank is null); tags are trimmed,
 * deduplicated and sorted by code unit. Anything the kind does not take is "not filtering".
 */
export function canonicalFilterValue(filter: AnyFilter, raw: unknown): unknown {
  switch (filter.kind) {
    case "flag": {
      return raw === true;
    }
    case "choices": {
      const picked = new Set(Array.isArray(raw) ? raw : []);
      return filter.values.filter((value) => picked.has(value));
    }
    case "ref": {
      const id = typeof raw === "string" ? raw.trim() : "";
      return id === "" ? null : id;
    }
    case "tags": {
      const items = Array.isArray(raw) ? raw : [];
      const trimmed = items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item !== "");
      return [...new Set(trimmed)].sort();
    }
    default: {
      return assertNeverFilter(filter);
    }
  }
}

/** Whether a canonical value filters at all (`false`, `null` and `[]` do not). */
export function isActiveFilterValue(
  filter: AnyFilter,
  value: unknown
): boolean {
  switch (filter.kind) {
    case "flag": {
      return value === true;
    }
    case "ref": {
      return typeof value === "string" && value !== "";
    }
    case "choices":
    case "tags": {
      return Array.isArray(value) && value.length > 0;
    }
    default: {
      return assertNeverFilter(filter);
    }
  }
}
