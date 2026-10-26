import type { ComponentProps } from "react";

import {
  usePickerSource,
  type PickerPort,
} from "@/shared/hooks/use-picker-source";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";

const NO_IDS: readonly string[] = [];

type SearchedEntityComboboxProps = Omit<
  ComponentProps<typeof EntityCombobox>,
  "entities" | "search"
> & {
  /** The Case's Entity list through the domain (`entityPickerPort(caseId)`). */
  port: PickerPort<EntityOption>;
  /** Ids never offered (the Dossier's own Entity, as a connection's peer). */
  excludeIds?: readonly string[];
  /** The picked record (its kind, its name), or null when cleared. */
  onEntityChange?: (entity: EntityOption | null) => void;
};

/**
 * The Entity picker searched on the server (#559): the most recently updated Entities while the
 * box is empty, matches by name, summary or notes from 3 characters, one small page either way.
 * The value's title comes from a by-ids read, so it shows even when it is not on that page.
 */
export function SearchedEntityCombobox({
  port,
  excludeIds = NO_IDS,
  value,
  onValueChange,
  onEntityChange,
  ...rest
}: SearchedEntityComboboxProps) {
  const source = usePickerSource(port, value === "" ? [] : [value]);
  const excluded = new Set(excludeIds);
  const entities = source.options.filter((ent) => !excluded.has(ent.id));
  return (
    <EntityCombobox
      {...rest}
      value={value}
      onValueChange={(id) => {
        onValueChange(id);
        onEntityChange?.(
          source.options.find((ent) => ent.id === id) ??
            source.selected.get(id) ??
            null
        );
      }}
      entities={entities}
      search={{
        onTextChange: source.onTextChange,
        isPending: source.status === "pending",
        selected: source.selected.get(value),
      }}
    />
  );
}
