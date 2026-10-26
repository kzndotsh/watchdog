import {
  isActiveFilterValue,
  type AnyListDef,
  type FilterKey,
} from "@watchdog/schemas/shared";

import type { ListHandle } from "./list-types";

/**
 * The filters the screen applied, in declaration order: the Filters popover's rows, the count on
 * its button and the chips. Fixed filters (and the ones they lock) are never among them.
 */
export function activeFilterKeys<
  D extends AnyListDef,
  Item,
  K extends FilterKey<D>,
>(list: ListHandle<D, Item, K>): FilterKey<D>[] {
  return list.controls.availableFilters.filter((key) =>
    isActiveFilterValue(list.def.filters[key], list.query.filters[key])
  );
}
