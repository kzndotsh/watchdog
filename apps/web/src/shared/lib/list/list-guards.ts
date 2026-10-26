import type {
  AnyFilter,
  AnyListDef,
  FilterKey,
  QueryValue,
  SortValue,
} from "@watchdog/schemas/shared";

/**
 * Runtime checks that recover a list's typed values in generic UI (the Filters popover, the
 * table's header sort). They read the declaration, so a value only passes when it is one the
 * list declares: no cast at the erased boundary.
 */

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** Whether `value` has the canonical shape of `filter`'s kind (what `withFilter` accepts). */
export function isFilterValueOf(filter: AnyFilter, value: unknown): boolean {
  switch (filter.kind) {
    case "flag": {
      return typeof value === "boolean";
    }
    case "ref": {
      return value === null || typeof value === "string";
    }
    case "choices": {
      const allowed: readonly string[] = filter.values;
      return (
        isStringArray(value) && value.every((item) => allowed.includes(item))
      );
    }
    case "tags": {
      return isStringArray(value);
    }
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

/** A canonical value of `def`'s filter `key`, recovered from the generic popover. */
export function isQueryValue<D extends AnyListDef, K extends FilterKey<D>>(
  def: D,
  key: K,
  value: unknown
): value is QueryValue<D["filters"][K]> {
  const filter: AnyFilter | undefined = def.filters[key];
  return filter !== undefined && isFilterValueOf(filter, value);
}

/** A declared filter name of `def`. */
export function isFilterKey<D extends AnyListDef>(
  def: D,
  key: string
): key is FilterKey<D> {
  return Object.hasOwn(def.filters, key);
}

/** The declared `key.dir` values of `def`, in declaration order. */
export function sortValuesOf(def: AnyListDef): readonly string[] {
  return Object.entries(def.sorts).flatMap(([key, sort]) =>
    sort.dirs.map((dir) => `${key}.${dir}`)
  );
}

/** A declared sort value of `def` (`"captured.desc"`). */
export function isSortValue<D extends AnyListDef>(
  def: D,
  value: string
): value is SortValue<D> {
  return sortValuesOf(def).includes(value);
}
