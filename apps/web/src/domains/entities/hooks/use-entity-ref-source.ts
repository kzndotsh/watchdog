import { useMemo, useState } from "react";

import { entityPickerPort } from "@/domains/entities/queries";
import { usePickerSource } from "@/shared/hooks/use-picker-source";
import type { ListOption, ListRefSource } from "@/shared/lib/list/list-types";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { entityDisplayLabel } from "@watchdog/schemas/shared";

function optionOf(entity: EntityOption): ListOption {
  return {
    value: entity.id,
    label: entityDisplayLabel({ name: entity.name, slug: entity.slug ?? "" }),
  };
}

/**
 * The `entityId` filter's picker (a `ref` filter, ADR-0007), searched on the server through the
 * same reads as the Entity pickers (`entityPickerPort`): one small page by the typed text, and
 * the selected Entity's title for its chip from `entities.getMany`. Never the whole Entity list.
 * The page is asked for only once the Filters popover has opened (`onOpenChange`).
 */
export function useEntityRefSource(
  caseId: string,
  selectedId: string | null
): ListRefSource {
  const port = useMemo(() => entityPickerPort(caseId), [caseId]);
  // The options page is read only while the Filters popover is open; the chip's title is a
  // by-id read and does not wait for it.
  const [isOpen, setIsOpen] = useState(false);
  const source = usePickerSource(
    port,
    selectedId === null ? [] : [selectedId],
    { isEnabled: isOpen }
  );
  const selected =
    selectedId === null ? undefined : source.selected.get(selectedId);
  return {
    kind: "ref",
    text: source.text,
    onTextChange: source.onTextChange,
    onOpenChange: setIsOpen,
    options: source.options.map(optionOf),
    isPending: source.status === "pending",
    selected: selected === undefined ? null : optionOf(selected),
  };
}
