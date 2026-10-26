import { cn } from "@/lib/utils";
import type { ListOption, ListTagSource } from "@/shared/lib/list/list-types";
import { CONTROL_HEIGHT } from "@/shared/ui/control-chrome";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/shared/ui/primitives/combobox";
import type { TagsFilter } from "@watchdog/schemas/shared";

type FilterTagsControlProps = {
  readonly filter: TagsFilter;
  readonly value: readonly string[];
  readonly source: ListTagSource;
  readonly onValueChange: (value: readonly string[]) => void;
};

/** A `tags` filter's value: any of the screen's open vocabulary, typed to narrow (the Cap catalog). */
export function FilterTagsControl({
  filter,
  value,
  source,
  onValueChange,
}: FilterTagsControlProps) {
  // A picked tag the source no longer lists (from the URL) stays picked, under its own name.
  const known = new Map(source.options.map((option) => [option.value, option]));
  const picked: ListOption[] = value.map(
    (item) => known.get(item) ?? { value: item, label: item }
  );
  const items = [
    ...source.options,
    ...picked.filter((option) => !known.has(option.value)),
  ];
  const text = picked.map((option) => option.label).join(", ");
  return (
    <Combobox
      multiple
      items={items}
      value={picked}
      itemToStringLabel={(option: ListOption) => option.label}
      isItemEqualToValue={(a: ListOption, b: ListOption) => a.value === b.value}
      onValueChange={(next: ListOption[]) => {
        onValueChange(next.map((option) => option.value));
      }}
    >
      <ComboboxInput
        showTrigger
        aria-label={`${filter.label} values`}
        placeholder={text === "" ? "Any" : text}
        className={cn(CONTROL_HEIGHT, "w-full min-w-0")}
      />
      <ComboboxContent>
        <ComboboxEmpty>No matches</ComboboxEmpty>
        <ComboboxList>
          {(option: ListOption) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="truncate">{option.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
