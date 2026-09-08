import { cn } from "@/lib/utils";
import { CONTROL_HEIGHT } from "@/shared/ui/control-chrome";
import {
  fieldComboboxMatchesQuery,
  type FieldComboboxOption,
} from "@/shared/ui/field-combobox.lib";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/shared/ui/shadcn/combobox";

export type { FieldComboboxOption } from "@/shared/ui/field-combobox.lib";

interface FieldComboboxGroup {
  value: string;
  items: FieldComboboxOption[];
}

function groupOptions(
  options: readonly FieldComboboxOption[]
): FieldComboboxGroup[] | null {
  if (!options.some((o) => o.group)) return null;

  const order: string[] = [];
  const map = new Map<string, FieldComboboxOption[]>();
  for (const option of options) {
    const key = option.group ?? "Other";
    const list = map.get(key);
    if (list) {
      list.push(option);
    } else {
      order.push(key);
      map.set(key, [option]);
    }
  }
  return order.map((value) => ({
    value,
    items: map.get(value) ?? [],
  }));
}

/**
 * Filterable string Combobox — same option shape as FieldSelect (+ optional group).
 * Type to narrow the list; pick an item to commit the value.
 */
export function FieldCombobox({
  value,
  onValueChange,
  options,
  placeholder = "Search…",
  emptyText = "No matches.",
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly FieldComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const flat = [...options];
  const groups = groupOptions(options);
  const selected = flat.find((o) => o.value === value) ?? null;

  return (
    <Combobox
      value={selected}
      items={groups ?? flat}
      itemToStringLabel={(opt: FieldComboboxOption) => opt.label}
      filter={(item, query) =>
        item ? fieldComboboxMatchesQuery(item, query) : true
      }
      disabled={disabled}
      onValueChange={(next: FieldComboboxOption | null, details) => {
        // Closed list + selection: Base UI stops Escape unless we allow it —
        // otherwise Dialog / table composers never dismiss.
        if (details.reason === "escape-key") {
          details.allowPropagation();
        }
        if (!next) return;
        if (next.value === value) return;
        onValueChange(next.value);
      }}
    >
      <ComboboxInput
        showTrigger
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={cn(
          CONTROL_HEIGHT,
          "w-full shrink-0 [&_[data-slot=input-group-control]]:text-xs",
          className
        )}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        {groups ? (
          <ComboboxList>
            {(group: FieldComboboxGroup) => (
              <ComboboxGroup
                key={group.value}
                items={group.items}
                className="block pb-1 last:pb-0"
              >
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(opt: FieldComboboxOption) => (
                    <ComboboxItem key={opt.value} value={opt}>
                      {opt.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        ) : (
          <ComboboxList>
            {(opt: FieldComboboxOption) => (
              <ComboboxItem key={opt.value} value={opt}>
                {opt.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
