import type {
  CellContext,
  ColumnDef,
  HeaderContext,
} from "@tanstack/react-table";
import { useId, useState } from "react";

import { GuideSection } from "@/routes/_protected/ui/-guide-chrome";
import {
  DEMO_ENTITIES,
  demoEntityName,
  demoEvidenceView,
  demoIdentifierView,
  type DemoEvidence,
  type DemoIdentifier,
  type DemoScope,
} from "@/routes/_protected/ui/-list-demo-data";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { useListTable } from "@/shared/hooks/list/use-list-table";
import type { ListRefSource } from "@/shared/lib/list/list-types";
import { DataTableColumnHeader } from "@/shared/ui/data-table/data-table-column-header";
import type { ServerTableFeatures } from "@/shared/ui/data-table/server-table-features";
import { ListBody, ListCount, ListTable, ListToolbar } from "@/shared/ui/list";
import { Button } from "@/shared/ui/primitives/button";
import { QueueRow } from "@/shared/ui/queue-row";
import { QueueRowMeta } from "@/shared/ui/queue-row-meta";
import { QueueRowTitle } from "@/shared/ui/queue-row-title";
import { SectionLabel } from "@/shared/ui/section-label";
import { QueueSkeleton } from "@/shared/ui/skeletons";
import { TabCount } from "@/shared/ui/tab-count";
import type { evidenceList } from "@watchdog/schemas/evidence";
import { identifierList } from "@watchdog/schemas/graph";
import {
  CONFIDENCE_TIER_LABELS,
  EVIDENCE_KIND_LABELS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_TYPE_LABELS,
  type ListSearch,
} from "@watchdog/schemas/shared";
import { Switch } from "@watchdog/ui/components/switch";

/* The list standard on in-memory data: the real declarations, `useList`, the toolbar, chips,
 * footer and both empty states, as a table (Identifiers) and as a queue body (Evidence). The
 * view lives in component state here; a screen keeps it in its route's URL. */

/** The gallery's `ref` picker: fake Entities searched in memory (a screen asks the server). */
function useDemoEntitySource(selectedId: string | null): ListRefSource {
  const [text, setText] = useState("");
  const needle = text.trim().toLowerCase();
  const options = DEMO_ENTITIES.filter((entity) =>
    entity.name.toLowerCase().includes(needle)
  ).map((entity) => ({ value: entity.id, label: entity.name }));
  const selected = DEMO_ENTITIES.find((entity) => entity.id === selectedId);
  return {
    kind: "ref",
    text,
    onTextChange: setText,
    options,
    isPending: false,
    selected:
      selected === undefined
        ? null
        : { value: selected.id, label: selected.name },
  };
}

function DatasetSwitch({
  dataset,
  onDatasetChange,
}: {
  dataset: DemoScope["dataset"];
  onDatasetChange: (dataset: DemoScope["dataset"]) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={dataset === "empty"}
        onCheckedChange={(checked) => {
          onDatasetChange(checked ? "empty" : "full");
        }}
      />
      <label htmlFor={id} className="text-muted-foreground text-xs">
        Empty dataset (shows “No … yet”)
      </label>
    </div>
  );
}

function ValueHeader({
  column,
}: HeaderContext<ServerTableFeatures, DemoIdentifier>) {
  return <DataTableColumnHeader column={column} title="Value" />;
}

function AddedHeader({
  column,
}: HeaderContext<ServerTableFeatures, DemoIdentifier>) {
  return <DataTableColumnHeader column={column} title="Added" />;
}

function ValueCell({ row }: CellContext<ServerTableFeatures, DemoIdentifier>) {
  return (
    <span className="block truncate font-mono text-xs">
      {row.original.value}
    </span>
  );
}

function EntityCell({ row }: CellContext<ServerTableFeatures, DemoIdentifier>) {
  return (
    <span className="block truncate">
      {demoEntityName(row.original.entityId)}
    </span>
  );
}

function AddedCell({ row }: CellContext<ServerTableFeatures, DemoIdentifier>) {
  return (
    <span className="text-muted-foreground font-mono text-xs">
      {row.original.createdAt.slice(0, 10)}
    </span>
  );
}

const IDENTIFIER_COLUMNS: ColumnDef<ServerTableFeatures, DemoIdentifier>[] = [
  {
    id: "value",
    size: 34,
    header: ValueHeader,
    cell: ValueCell,
    enableHiding: false,
  },
  {
    id: "type",
    size: 12,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    meta: { label: "Type" },
    cell: ({ row }) => IDENTIFIER_TYPE_LABELS[row.original.type],
  },
  {
    id: "status",
    size: 12,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    meta: { label: "Status" },
    cell: ({ row }) => IDENTIFIER_STATUS_LABELS[row.original.status],
  },
  {
    id: "confidence",
    size: 12,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Confidence" />
    ),
    meta: { label: "Confidence" },
    cell: ({ row }) => CONFIDENCE_TIER_LABELS[row.original.confidence],
  },
  {
    id: "entity",
    size: 18,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Entity" />
    ),
    meta: { label: "Entity" },
    cell: EntityCell,
  },
  {
    id: "added",
    size: 12,
    header: AddedHeader,
    meta: { label: "Added" },
    cell: AddedCell,
  },
];

function IdentifiersTableSpecimen() {
  const [dataset, setDataset] = useState<DemoScope["dataset"]>("full");
  const [search, setSearch] = useState<ListSearch<typeof identifierList>>({});
  const list = useList(demoIdentifierView, {
    scope: { dataset },
    search,
    onSearchChange: (patch) => {
      setSearch((prev) => ({ ...prev, ...patch }));
    },
  });
  const display = useListDisplay("ui-gallery.identifiers");
  const { table } = useListTable(list, {
    columns: IDENTIFIER_COLUMNS,
    sortColumns: { value: "value", added: "added" },
    display,
  });
  const entitySource = useDemoEntitySource(list.query.filters.entityId);
  const addButton = (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        setDataset("full");
      }}
    >
      Add identifier
    </Button>
  );
  return (
    <div className="flex flex-col gap-3" data-testid="list-specimen-table">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel as="h3">
          Identifiers table
          <TabCount
            n={
              <ListCount
                count={list.count}
                noun={identifierList.noun}
                variant="compact"
                isLive={false}
              />
            }
          />
        </SectionLabel>
        <DatasetSwitch dataset={dataset} onDatasetChange={setDataset} />
      </div>
      <ListToolbar
        list={list}
        display={display}
        table={table}
        sources={{ entityId: entitySource }}
        actions={addButton}
      />
      <ListTable
        list={list}
        table={table}
        density={display.density}
        blankSlateAction={addButton}
        onRowClick={(row) => {
          list.selection.toggle(row.id);
        }}
      />
    </div>
  );
}

const EVIDENCE_TOGGLES = [
  { id: "urls", label: "Show source URLs", isDefaultOn: true },
] as const;

function EvidenceQueueSpecimen() {
  const [dataset, setDataset] = useState<DemoScope["dataset"]>("full");
  const [search, setSearch] = useState<ListSearch<typeof evidenceList>>({});
  const list = useList(demoEvidenceView, {
    scope: { dataset },
    search,
    onSearchChange: (patch) => {
      setSearch((prev) => ({ ...prev, ...patch }));
    },
  });
  const display = useListDisplay("ui-gallery.evidence", EVIDENCE_TOGGLES);
  const entitySource = useDemoEntitySource(list.query.filters.entityId);
  const isUrlShown = display.isToggleOn("urls");
  const addButton = (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        setDataset("full");
      }}
    >
      Dump a URL
    </Button>
  );
  return (
    <div className="flex flex-col gap-3" data-testid="list-specimen-queue">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel as="h3">Evidence queue</SectionLabel>
        <DatasetSwitch dataset={dataset} onDatasetChange={setDataset} />
      </div>
      <ListToolbar
        list={list}
        display={display}
        sources={{ entityId: entitySource }}
        actions={addButton}
      />
      <div className="border-border flex min-h-80 flex-col rounded-lg border">
        <ListBody
          list={list}
          skeleton={<QueueSkeleton />}
          blankSlateAction={addButton}
        >
          {(rows: readonly DemoEvidence[]) => (
            <div
              role="listbox"
              aria-label="Evidence"
              className="divide-border flex flex-col divide-y"
            >
              {rows.map((row) => (
                <QueueRow
                  key={row.id}
                  isSelected={list.selection.ids.has(row.id)}
                  className={
                    display.density === "compact" ? "py-0.5" : undefined
                  }
                  onClick={() => {
                    list.selection.toggle(row.id);
                  }}
                >
                  <QueueRowTitle>{row.label}</QueueRowTitle>
                  <QueueRowMeta>
                    {EVIDENCE_KIND_LABELS[row.kind]} ·{" "}
                    {row.capturedAt.slice(0, 10)}
                    {isUrlShown ? ` · ${row.sourceUrl}` : null}
                  </QueueRowMeta>
                </QueueRow>
              ))}
            </div>
          )}
        </ListBody>
      </div>
    </div>
  );
}

export function ListsSection() {
  return (
    <GuideSection
      id="lists"
      title="Lists"
      blurb="The list standard (ADR-0007) on in-memory data: one toolbar (search, Filters, Display options, actions), chips while filtered, the count and Load more, and the two empty states. Search for “zzz” to see no-match; switch on Empty dataset to see blank."
    >
      <IdentifiersTableSpecimen />
      <EvidenceQueueSpecimen />
    </GuideSection>
  );
}
