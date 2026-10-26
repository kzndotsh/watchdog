import { useMemo, useState } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionAddButton } from "@/domains/dossier/components/dossier-section-add-button";
import { ConnectionDialog } from "@/domains/dossier/components/ego-graph/connection-dialog";
import { ConnectionEgoGraph } from "@/domains/dossier/components/ego-graph/connection-ego-graph";
import { CompactConnectionList } from "@/domains/dossier/components/ego-graph/connection-list";
import { RemoveConnectionDialog } from "@/domains/dossier/components/remove-connection-dialog";
import { useConnectionEditor } from "@/domains/dossier/hooks/use-connection-editor";
import {
  useSectionListView,
  type SectionListView,
} from "@/domains/dossier/hooks/use-section-list-view";
import type { DossierConnectionsSearch } from "@/domains/dossier/lib/dossier-tabs";
import type { DossierSectionWithEvidenceProps } from "@/domains/dossier/types";
import { edgeListView } from "@/domains/entities/edges/queries";
import { edgeFromEntity } from "@/domains/entities/lib/connection-peers";
import type { EntityRecord } from "@/domains/entities/types";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { ListBody, ListToolbar } from "@/shared/ui/list";
import { DossierConnectionsSkeletonLayout } from "@/shared/ui/skeletons";
import type { edgeList } from "@watchdog/schemas/graph";
import type { UnfixedSearchPatch } from "@watchdog/schemas/shared";
import { FieldError } from "@watchdog/ui/components/field";

/** The Connections tab's view in the route's URL (the Overview's nest keeps its own). */
export type ConnectionsSectionView = SectionListView<
  DossierConnectionsSearch,
  UnfixedSearchPatch<typeof edgeList, "entityId">
>;

export type ConnectionsSectionProps = DossierSectionWithEvidenceProps & {
  entity: Pick<EntityRecord, "id" | "name" | "slug" | "kind">;
  shouldFillHeight?: boolean;
  /** The tab's URL view and toolbar; without it the section shows the default view. */
  view?: ConnectionsSectionView;
};

const NO_SEARCH: DossierConnectionsSearch = {};

/**
 * An Entity's Connections: the Case's Connection list with `entityId` fixed (ADR-0007), a page at
 * a time, grouped by direction, and beside it the ego graph (`ConnectionEgoGraph`).
 */
export function ConnectionsSection({
  caseId,
  entityId,
  entitySlug,
  entity,
  emptyPresentation = "inline",
  shouldFillHeight = false,
  view,
}: ConnectionsSectionProps) {
  const scope = { caseId, entityId, entitySlug };
  const { search, onSearchChange } = useSectionListView(view, NO_SEARCH);
  const list = useList(edgeListView, {
    scope: { caseId },
    fixed: { entityId },
    search,
    onSearchChange,
  });
  const display = useListDisplay("dossier-connections");
  const rows = useMemo(
    () => list.rows.map((row) => edgeFromEntity(row, entityId)),
    [list.rows, entityId]
  );
  const editor = useConnectionEditor(scope);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const isPanel = emptyPresentation === "panel";
  const center = {
    id: entity.id,
    name: entity.name,
    slug: entity.slug,
    kind: entity.kind,
  };

  return (
    <DossierSection
      title="Connections"
      isEmpty={!isPanel && list.status === "blank" && editor.isClosed}
      emptyPresentation={emptyPresentation}
      emptyText="No connections to other entities yet."
      actions={
        <DossierSectionAddButton
          variant="ghost"
          onClick={editor.handleOpenCreate}
        />
      }
      className={shouldFillHeight ? "min-h-0 flex-1" : undefined}
      shouldFill={isPanel}
    >
      <div
        className={
          shouldFillHeight
            ? "flex min-h-0 flex-1 flex-col gap-3"
            : "flex flex-col gap-3 pb-4"
        }
      >
        {view === undefined ? null : (
          <ListToolbar list={list} display={display} />
        )}
        {editor.isEditGone ? (
          <FieldError>That connection is no longer in the Case.</FieldError>
        ) : null}
        <ListBody
          list={list}
          skeleton={isPanel ? <DossierConnectionsSkeletonLayout /> : null}
          blankSlateAction={
            <DossierSectionAddButton
              variant="panel"
              noun="connection"
              onClick={editor.handleOpenCreate}
            />
          }
        >
          {() => (
            <CompactConnectionList
              outbound={rows.filter((r) => r.direction === "out")}
              inbound={rows.filter((r) => r.direction === "in")}
              onEdit={editor.handleOpenEdit}
              onRemove={setPendingDeleteId}
              className={shouldFillHeight ? "max-h-72" : undefined}
            />
          )}
        </ListBody>
        {list.status === "blank" ? null : (
          <ConnectionEgoGraph
            caseId={caseId}
            center={center}
            shouldFillHeight={shouldFillHeight}
            onEditEdge={(edgeId) => {
              editor.handleOpenEditById(edgeId, rows);
            }}
          />
        )}
      </div>

      <ConnectionDialog
        open={editor.isOpen}
        onOpenChange={(open) => {
          if (!open) editor.handleClose();
        }}
        mode={editor.editing === null ? "create" : "edit"}
        initial={editor.editing}
        center={center}
        caseId={caseId}
        isBusy={editor.isBusy}
        error={editor.submitError}
        onSubmit={editor.handleSubmit}
      />

      <RemoveConnectionDialog
        scope={scope}
        edgeId={pendingDeleteId}
        onClose={() => {
          setPendingDeleteId(null);
        }}
      />
    </DossierSection>
  );
}
