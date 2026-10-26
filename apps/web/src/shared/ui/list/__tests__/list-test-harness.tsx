import { useState, type ReactNode } from "react";

import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import type { ListRefSource } from "@/shared/lib/list/list-types";
import { ListBody, ListToolbar } from "@/shared/ui/list";
import {
  ACME_ID,
  NORTH_ID,
  type harnessView,
} from "@/shared/ui/list/__tests__/list-test-fixtures";
import type { evidenceList } from "@watchdog/schemas/evidence";
import type {
  ListSearch,
  UnfixedSearch,
  UnfixedSearchPatch,
} from "@watchdog/schemas/shared";

function entitySource(selectedId: string | null): ListRefSource {
  const options = [
    { value: ACME_ID, label: "Acme Ltd" },
    { value: NORTH_ID, label: "Northwharf" },
  ];
  return {
    kind: "ref",
    text: "",
    onTextChange: () => undefined,
    options,
    isPending: false,
    selected: options.find((option) => option.value === selectedId) ?? null,
  };
}

const NO_SEARCH: ListSearch<typeof evidenceList> = {};

type HarnessProps = {
  readonly view: ReturnType<typeof harnessView>;
  readonly initialSearch?: ListSearch<typeof evidenceList>;
  /** Spy on what the list writes to the URL. */
  readonly onSearchChange?: (
    patch: UnfixedSearchPatch<typeof evidenceList, never>
  ) => void;
  readonly blankAction?: ReactNode;
};

/** A queue body over the Evidence declaration, its view kept in state as a route keeps it in the URL. */
export function EvidenceHarness({
  view,
  initialSearch = NO_SEARCH,
  onSearchChange,
  blankAction,
}: HarnessProps) {
  const [search, setSearch] = useState(initialSearch);
  const list = useList(view, {
    scope: "case",
    search,
    onSearchChange: (patch) => {
      onSearchChange?.(patch);
      setSearch((prev) => ({ ...prev, ...patch }));
    },
  });
  const display = useListDisplay("harness");
  return (
    <>
      <ListToolbar
        list={list}
        display={display}
        sources={{ entityId: entitySource(list.query.filters.entityId) }}
      />
      <ListBody
        list={list}
        skeleton={<p>Loading rows</p>}
        blankSlateAction={blankAction}
      >
        {(rows) => (
          <ul>
            {rows.map((row) => (
              <li key={row.id}>{row.label}</li>
            ))}
          </ul>
        )}
      </ListBody>
    </>
  );
}

type FixedHarnessProps = {
  readonly view: ReturnType<typeof harnessView>;
  readonly entityId: string;
  readonly onSearchChange?: (patch: object) => void;
};

/** The Dossier shape: the same list with `entityId` fixed (never in the URL, never a chip). */
export function FixedEntityHarness({
  view,
  entityId,
  onSearchChange,
}: FixedHarnessProps) {
  const [search, setSearch] = useState<
    UnfixedSearch<typeof evidenceList, "entityId">
  >({ kind: ["file"] });
  const list = useList(view, {
    scope: "case",
    fixed: { entityId },
    search,
    onSearchChange: (patch) => {
      onSearchChange?.(patch);
      setSearch((prev) => ({ ...prev, ...patch }));
    },
  });
  const display = useListDisplay("harness-fixed");
  return (
    <>
      <ListToolbar list={list} display={display} />
      <ListBody list={list} skeleton={<p>Loading rows</p>}>
        {(rows) => (
          <ul>
            {rows.map((row) => (
              <li key={row.id}>{row.label}</li>
            ))}
          </ul>
        )}
      </ListBody>
    </>
  );
}
