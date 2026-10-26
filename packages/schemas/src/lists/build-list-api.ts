import { z } from "zod";

import { NAME_MAX } from "../limits";
import {
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  pageInputFields,
} from "../pagination";
import type { ListDecl, ReservedParam, SortDir } from "./define-list";
import {
  canonicalFilterValue,
  emptyFilterValue,
  isActiveFilterValue,
  urlParam,
} from "./filter-kinds";
import type { AnyFilter } from "./filter-kinds";
import { LIST_SEARCH_MIN_LENGTH, LIST_TOTAL_CAP } from "./list-page";

/**
 * The runtime behind `defineList` (ADR-0007), erased: it works on `ListDecl` and plain records,
 * and `defineList` asserts its result as the typed `ListDefApi<D>`. Only `defineList` calls it.
 */

/** Runtime shapes, erased: `ListDefApi<D>` is the typed view of these. */
type Values = Readonly<Record<string, unknown>>;
type Query = {
  readonly filters: Values;
  readonly q: string | null;
  readonly sort: string;
};

const RESERVED_PARAMS: ReadonlySet<string> = new Set<ReservedParam>([
  "q",
  "sort",
  "cursor",
  "limit",
]);

/** The keys a screen fixes: those with a value. */
function fixedKeys(fixed: Values | undefined): Set<string> {
  return new Set(
    Object.entries(fixed ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
  );
}

/** The other member of an exclusive pair, or undefined when the pair does not name `key`. */
function partnerOf(
  pair: readonly [string, string],
  key: string
): string | undefined {
  const [a, b] = pair;
  if (a === key) return b;
  return b === key ? a : undefined;
}

export function buildListApi(decl: ListDecl) {
  const filters = Object.entries(decl.filters);
  const pairs = decl.exclusive ?? [];
  const sortValues = Object.entries(decl.sorts).flatMap(([key, sort]) =>
    sort.dirs.map((dir) => `${key}.${dir}`)
  );
  const [firstSort, ...otherSorts] = sortValues;
  if (firstSort === undefined || !sortValues.includes(decl.defaultSort)) {
    throw new Error(`List ${decl.name}: defaultSort must be a declared sort`);
  }
  const sortSchema = z.enum([firstSort, ...otherSorts]);
  const pageLimit = decl.limit ?? {
    default: PAGE_LIMIT_DEFAULT,
    max: PAGE_LIMIT_MAX,
  };

  const filterOf = (key: string): AnyFilter | undefined => decl.filters[key];
  const isActive = (key: string, value: unknown): boolean => {
    const filter = filterOf(key);
    return filter !== undefined && isActiveFilterValue(filter, value);
  };
  const searchText = (q: unknown): string | null => {
    const text = typeof q === "string" ? q.trim() : "";
    return decl.search !== undefined && text.length >= LIST_SEARCH_MIN_LENGTH
      ? text
      : null;
  };

  /** Wire: a trimmed `q` of 1 or 2 characters is a 400, never silently dropped. */
  const qWire = z
    .string()
    .trim()
    .max(NAME_MAX)
    .refine((q) => q === "" || q.length >= LIST_SEARCH_MIN_LENGTH, {
      message: `Search needs at least ${LIST_SEARCH_MIN_LENGTH} characters`,
    })
    .optional();
  /** URL: a bad or short `q` is dropped. */
  const qUrl = urlParam(z.string().max(NAME_MAX).optional()).transform(
    (q) => searchText(q) ?? undefined
  );

  const input = decl.scope
    .extend({
      ...Object.fromEntries(filters.map(([key, f]) => [key, f.wire])),
      ...(decl.search === undefined ? {} : { q: qWire }),
      sort: sortSchema.optional(),
      cursor: pageInputFields.cursor,
      limit: z
        .number()
        .int()
        .min(1)
        .max(pageLimit.max)
        .default(pageLimit.default),
    })
    .superRefine((value: Values, ctx) => {
      for (const [a, b] of pairs) {
        const fa = filterOf(a);
        const fb = filterOf(b);
        if (fa === undefined || fb === undefined) continue;
        if (
          isActive(a, canonicalFilterValue(fa, value[a])) &&
          isActive(b, canonicalFilterValue(fb, value[b]))
        ) {
          ctx.addIssue({
            code: "custom",
            path: [b],
            message: `${fa.label} and ${fb.label} cannot both be set`,
          });
        }
      }
    });

  const searchWith = (extra: z.ZodRawShape) => {
    const reused = Object.keys(extra).filter(
      (key) => key in decl.filters || RESERVED_PARAMS.has(key)
    );
    if (reused.length > 0) {
      throw new Error(
        `List ${decl.name}: route search params reuse list params: ${reused.join(", ")}`
      );
    }
    return z.object({
      ...Object.fromEntries(filters.map(([key, f]) => [key, f.url])),
      ...(decl.search === undefined ? {} : { q: qUrl }),
      sort: urlParam(sortSchema.optional()),
      ...extra,
    });
  };

  /** Clears the partner of every exclusive pair that is fully set, keeping a fixed filter. */
  const resolveExclusive = (values: Values, fixed: Set<string>): Values => {
    const out: Record<string, unknown> = { ...values };
    for (const [a, b] of pairs) {
      if (!isActive(a, out[a]) || !isActive(b, out[b])) continue;
      const drop = fixed.has(b) && !fixed.has(a) ? a : b;
      const filter = filterOf(drop);
      if (filter !== undefined) out[drop] = emptyFilterValue(filter);
    }
    return out;
  };

  const queryOf = (from: Values, fixed?: Values): Query => {
    const pinned = fixedKeys(fixed);
    const values = Object.fromEntries(
      filters.map(([key, f]) => [
        key,
        canonicalFilterValue(f, pinned.has(key) ? fixed?.[key] : from[key]),
      ])
    );
    const sort =
      typeof from.sort === "string" && sortValues.includes(from.sort)
        ? from.sort
        : decl.defaultSort;
    return {
      filters: resolveExclusive(values, pinned),
      q: searchText(from.q),
      sort,
    };
  };

  const keyOf = (query: Query): string => {
    const active = filters.flatMap(([key, f]) => {
      const value = canonicalFilterValue(f, query.filters[key]);
      return isActiveFilterValue(f, value) ? [[key, value]] : [];
    });
    return JSON.stringify([query.sort, searchText(query.q), active]);
  };

  const toSearch = (query: Query, fixed?: Values): Values => {
    const pinned = fixedKeys(fixed);
    const patch: Record<string, unknown> = Object.fromEntries(
      filters
        .filter(([key]) => !pinned.has(key))
        .map(([key, f]) => {
          const value = canonicalFilterValue(f, query.filters[key]);
          if (!isActiveFilterValue(f, value)) return [key, undefined];
          return [key, f.kind === "flag" ? true : value];
        })
    );
    if (decl.search !== undefined) patch.q = query.q ?? undefined;
    patch.sort = query.sort === decl.defaultSort ? undefined : query.sort;
    return patch;
  };

  const isFiltered = (query: Query, fixed?: Values): boolean => {
    const pinned = fixedKeys(fixed);
    return (
      query.q !== null ||
      filters.some(
        ([key]) => !pinned.has(key) && isActive(key, query.filters[key])
      )
    );
  };

  /** Fixed, or exclusive with an active fixed filter: a screen cannot set it. */
  const isLocked = (key: string, fixed: Values | undefined): boolean => {
    const pinned = fixedKeys(fixed);
    if (pinned.has(key)) return true;
    return pairs.some((pair) => {
      const partner = partnerOf(pair, key);
      const other = partner === undefined ? undefined : filterOf(partner);
      return (
        partner !== undefined &&
        other !== undefined &&
        pinned.has(partner) &&
        isActiveFilterValue(
          other,
          canonicalFilterValue(other, fixed?.[partner])
        )
      );
    });
  };

  const withFilter = (
    query: Query,
    key: string,
    value: unknown,
    fixed?: Values
  ): Query => {
    const filter = filterOf(key);
    if (filter === undefined || isLocked(key, fixed)) return query;
    const pinned = fixedKeys(fixed);
    const next: Record<string, unknown> = {
      ...query.filters,
      [key]: canonicalFilterValue(filter, value),
    };
    if (isActive(key, next[key])) {
      for (const pair of pairs) {
        const partner = partnerOf(pair, key);
        const other = partner === undefined ? undefined : filterOf(partner);
        if (
          partner !== undefined &&
          other !== undefined &&
          !pinned.has(partner)
        ) {
          next[partner] = emptyFilterValue(other);
        }
      }
    }
    return { ...query, filters: next };
  };

  const availableFilters = (fixed?: Values): string[] =>
    filters.map(([key]) => key).filter((key) => !isLocked(key, fixed));

  const cleared = (query: Query, fixed?: Values): Query => {
    const pinned = fixedKeys(fixed);
    return {
      filters: Object.fromEntries(
        filters.map(([key, f]) => [
          key,
          pinned.has(key)
            ? canonicalFilterValue(f, fixed?.[key])
            : emptyFilterValue(f),
        ])
      ),
      q: null,
      sort: query.sort,
    };
  };

  const sortParts = (sort: string) => {
    const at = sort.lastIndexOf(".");
    const key = sort.slice(0, at);
    const declared = decl.sorts[key];
    if (declared === undefined || !sortValues.includes(sort)) {
      throw new Error(`List ${decl.name}: undeclared sort ${sort}`);
    }
    const dir: SortDir = sort.slice(at + 1) === "asc" ? "asc" : "desc";
    return { key, dir, type: declared.type };
  };

  return {
    input,
    searchWith,
    queryOf,
    keyOf,
    toSearch,
    isFiltered,
    withFilter,
    availableFilters,
    cleared,
    sortParts,
    pageLimit,
    totalCap: decl.totalCap ?? LIST_TOTAL_CAP,
  };
}
