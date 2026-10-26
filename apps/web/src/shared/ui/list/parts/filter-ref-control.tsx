import { cn } from "@/lib/utils";
import type { ListOption, ListRefSource } from "@/shared/lib/list/list-types";
import { CONTROL_HEIGHT } from "@/shared/ui/control-chrome";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/shared/ui/primitives/combobox";
import type { RefFilter } from "@watchdog/schemas/shared";

type FilterRefControlProps = {
  readonly filter: RefFilter;
  readonly value: string | null;
  readonly source: ListRefSource;
  readonly onValueChange: (value: string | null) => void;
};

/**
 * A `ref` filter's value: one record, picked from the screen's server-searched options. The
 * typed text goes to the screen's source (it searches); the selected record shows its title
 * from the source, never its id.
 */
export function FilterRefControl({
  filter,
  value,
  source,
  onValueChange,
}: FilterRefControlProps) {
  const selected: ListOption | null =
    value === null
      ? null
      : (source.options.find((option) => option.value === value) ??
        (source.selected?.value === value ? source.selected : null) ?? {
          value,
          label: "…",
        });
  const items =
    selected === null ||
    source.options.some((option) => option.value === selected.value)
      ? source.options
      : [selected, ...source.options];
  return (
    <Combobox
      items={items}
      value={selected}
      filter={null}
      itemToStringLabel={(option: ListOption) => option.label}
      isItemEqualToValue={(a: ListOption, b: ListOption) => a.value === b.value}
      inputValue={source.text}
      onInputValueChange={(text) => {
        source.onTextChange(text);
      }}
      onValueChange={(next: ListOption | null) => {
        onValueChange(next?.value ?? null);
      }}
    >
      <ComboboxInput
        showTrigger
        aria-label={`${filter.label} value`}
        placeholder={selected?.label ?? `Search ${filter.label.toLowerCase()}…`}
        className={cn(CONTROL_HEIGHT, "w-full min-w-0")}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {source.isPending ? "Searching…" : "No matches"}
        </ComboboxEmpty>
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
