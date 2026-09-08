import type { FieldSelectOption } from "@/shared/ui/field-select";

export type FieldComboboxOption = FieldSelectOption & {
  /** When set on any option, list renders under ComboboxGroup headings. */
  group?: string;
};

export function fieldComboboxMatchesQuery(
  option: FieldComboboxOption,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const haystack = [option.label, option.value, option.group ?? ""]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
