import { useMemo } from "react";

import type { libraryList } from "@/domains/library/lib/library-list";
import type { InputKindOption, LibraryEntry } from "@/domains/library/types";
import type { ListDisplay } from "@/shared/hooks/list/use-list-display";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import type { ListHandle } from "@/shared/lib/list/list-types";
import { ListToolbar } from "@/shared/ui/list";

export type LibraryToolbarProps = {
  list: ListHandle<typeof libraryList, LibraryEntry>;
  display: ListDisplay;
  /** The input kinds some entry takes, with how many: the `Takes` filter's options. */
  kindOptions: readonly InputKindOption[];
};

/**
 * The Library's toolbar is the standard list toolbar (search, Filters, Display options and the
 * chips) over the bounded list; "start from what you have" is its `Takes` filter.
 */
export function LibraryToolbar({
  list,
  display,
  kindOptions,
}: LibraryToolbarProps) {
  const kindSource = useMemo(
    () => ({
      kind: "tags" as const,
      options: kindOptions.map((option) => ({
        value: option.value,
        label: `${option.label} (${option.count})`,
      })),
    }),
    [kindOptions]
  );
  return (
    <PageToolbar
      center={
        <div className="min-w-0 flex-1">
          <ListToolbar
            list={list}
            display={display}
            sources={{ kind: kindSource }}
          />
        </div>
      }
    />
  );
}
