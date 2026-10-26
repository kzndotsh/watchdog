import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { entitiesListQuery } from "@/domains/entities/queries";
import { listPending } from "@/shared/lib/list-pending";
import type { ListOption, ListRefSource } from "@/shared/lib/list/list-types";
import { entityMatchesQuery } from "@/shared/ui/entity-match";
import { entityDisplayLabel } from "@watchdog/schemas/shared";

/** At most this many Entities in the picker: typing narrows it. */
const ENTITY_REF_OPTIONS_MAX = 50;

/**
 * The `entityId` filter's picker (a `ref` filter, ADR-0007): the Case's Entities matched by the
 * typed text, and the selected Entity's title for its chip. It reads the Case's Entity list,
 * which the screens that offer it already hold for their composers; when Entities move onto the
 * list standard this asks the server instead, with the same shape.
 */
export function useEntityRefSource(
  caseId: string,
  selectedId: string | null
): ListRefSource {
  const [text, setText] = useState("");
  const entitiesQuery = useQuery(entitiesListQuery(caseId));
  const entities = entitiesQuery.data;
  const options = useMemo((): ListOption[] => {
    const matched = (entities ?? []).filter((entity) =>
      entityMatchesQuery(entity, text)
    );
    return matched.slice(0, ENTITY_REF_OPTIONS_MAX).map((entity) => ({
      value: entity.id,
      label: entityDisplayLabel(entity),
    }));
  }, [entities, text]);
  const selected = entities?.find((entity) => entity.id === selectedId);
  return {
    kind: "ref",
    text,
    onTextChange: setText,
    options,
    isPending: listPending(entitiesQuery),
    selected:
      selected === undefined
        ? null
        : { value: selected.id, label: entityDisplayLabel(selected) },
  };
}
