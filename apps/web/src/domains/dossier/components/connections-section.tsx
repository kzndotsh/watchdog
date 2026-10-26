import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { egoTruncationNotice } from "@/domains/cases/lib/graph-notice";
import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionAddButton } from "@/domains/dossier/components/dossier-section-add-button";
import { ConnectionDialog } from "@/domains/dossier/components/ego-graph/connection-dialog";
import type { ConnectionFormValues } from "@/domains/dossier/components/ego-graph/connection-dialog";
import { CompactConnectionList } from "@/domains/dossier/components/ego-graph/connection-list";
import type { EgoEdge } from "@/domains/dossier/components/ego-graph/edges-to-flow";
import { EgoNeighborhoodCanvas } from "@/domains/dossier/components/ego-graph/ego-neighborhood-canvas";
import { useCreateConnection } from "@/domains/dossier/hooks/use-create-connection";
import { useDeleteConnection } from "@/domains/dossier/hooks/use-delete-connection";
import {
  useSectionListView,
  type SectionListView,
} from "@/domains/dossier/hooks/use-section-list-view";
import { useUpdateConnection } from "@/domains/dossier/hooks/use-update-connection";
import type { DossierConnectionsSearch } from "@/domains/dossier/lib/dossier-tabs";
import type { DossierSectionWithEvidenceProps } from "@/domains/dossier/types";
import {
  edgeByIdQuery,
  edgeListView,
  graphEgoQuery,
} from "@/domains/entities/edges/queries";
import type { EdgeRecord } from "@/domains/entities/edges/types";
import { edgeFromEntity } from "@/domains/entities/lib/connection-peers";
import type { EntityRecord } from "@/domains/entities/types";
import { couldnt } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { useListCount } from "@/shared/hooks/list/use-list-count";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { ListBody, ListToolbar } from "@/shared/ui/list";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";
import { DossierConnectionsSkeletonLayout } from "@/shared/ui/skeletons";
import { edgeList } from "@watchdog/schemas/graph";
import type { UnfixedSearchPatch } from "@watchdog/schemas/shared";
import { FieldError } from "@watchdog/ui/components/field";

const NO_EGO_EDGES: readonly EgoEdge[] = [];

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

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; edge: EdgeRecord }
  /** The ego graph drew a Connection the list has not loaded: it is read by id first. */
  | { mode: "edit-by-id"; edgeId: string };

const NO_SEARCH: DossierConnectionsSearch = {};

/**
 * An Entity's Connections: the Case's Connection list with `entityId` fixed (ADR-0007), a page at
 * a time, grouped by direction, and beside it the ego graph, the server's capped star of the
 * Entity's most recently updated Connections (`graph.ego`, with a notice when it was cut).
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
  // The tab's count (the default view's first-page total) names the "of M" when the star is cut.
  const connectionCount = useListCount(
    edgeListView,
    { caseId },
    edgeList.queryOf({}, { entityId })
  );
  const egoQuery = useQuery(graphEgoQuery(caseId, entityId));
  const egoNotice =
    egoQuery.data === undefined
      ? null
      : egoTruncationNotice(egoQuery.data, connectionCount.total);

  const rows = useMemo(
    () => list.rows.map((row) => edgeFromEntity(row, entityId)),
    [list.rows, entityId]
  );
  const outRows = useMemo(
    () => rows.filter((r) => r.direction === "out"),
    [rows]
  );
  const inRows = useMemo(
    () => rows.filter((r) => r.direction === "in"),
    [rows]
  );

  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const byIdQuery = useQuery(
    edgeByIdQuery(caseId, dialog.mode === "edit-by-id" ? dialog.edgeId : null)
  );
  let editing: EdgeRecord | null = null;
  if (dialog.mode === "edit") editing = dialog.edge;
  if (dialog.mode === "edit-by-id" && byIdQuery.data) {
    editing = edgeFromEntity(byIdQuery.data, entityId);
  }
  const isEditGone = dialog.mode === "edit-by-id" && byIdQuery.data === null;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const createMutation = useCreateConnection({
    onCreated: () => {
      setDialog({ mode: "closed" });
      setSubmitError(null);
    },
    onError: setSubmitError,
  });

  const updateMutation = useUpdateConnection({
    onUpdated: () => {
      setDialog({ mode: "closed" });
      setSubmitError(null);
    },
    onError: setSubmitError,
    onReload: () => {
      setDialog({ mode: "closed" });
      setSubmitError(null);
    },
  });

  const deleteMutation = useDeleteConnection({
    onDeleted: () => {
      setPendingDeleteId(null);
      setDeleteError(null);
    },
    onError: setDeleteError,
  });

  function handleOpenCreate() {
    setSubmitError(null);
    setDialog({ mode: "create" });
  }

  function handleOpenEdit(edge: EdgeRecord) {
    setSubmitError(null);
    setDialog({ mode: "edit", edge });
  }

  function handleOpenEditById(edgeId: string) {
    const edge = rows.find((r) => r.id === edgeId);
    setSubmitError(null);
    setDialog(
      edge === undefined
        ? { mode: "edit-by-id", edgeId }
        : { mode: "edit", edge }
    );
  }

  async function handleDialogSubmit(values: ConnectionFormValues) {
    try {
      if (dialog.mode === "create") {
        await createMutation.mutateAsync({ ...scope, values });
        return;
      }
      if (editing !== null) {
        await updateMutation.mutateAsync({
          ...scope,
          edge: editing,
          expectedVersion: editing.version,
          values,
        });
      }
    } catch {
      // onError already set submitError — keep dialog open
    }
  }

  const dialogBusy = createMutation.isPending || updateMutation.isPending;
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
      isEmpty={!isPanel && list.status === "blank" && dialog.mode === "closed"}
      emptyPresentation={emptyPresentation}
      emptyText="No connections to other entities yet."
      actions={
        <DossierSectionAddButton variant="ghost" onClick={handleOpenCreate} />
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
        {isEditGone ? (
          <FieldError>That connection is no longer in the Case.</FieldError>
        ) : null}
        <ListBody
          list={list}
          skeleton={isPanel ? <DossierConnectionsSkeletonLayout /> : null}
          blankSlateAction={
            <DossierSectionAddButton
              variant="panel"
              noun="connection"
              onClick={handleOpenCreate}
            />
          }
        >
          {() => (
            <CompactConnectionList
              outbound={outRows}
              inbound={inRows}
              onEdit={handleOpenEdit}
              onRemove={setPendingDeleteId}
              className={shouldFillHeight ? "max-h-72" : undefined}
            />
          )}
        </ListBody>
        {list.status === "blank" ? null : (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            {egoNotice === null ? null : (
              <p
                data-slot="ego-truncation-notice"
                className="text-muted-foreground text-xs"
              >
                {egoNotice}
              </p>
            )}
            {egoQuery.isError ? (
              <FetchErrorAlert
                error={couldnt("load", "the connection graph")}
                onRetry={() => {
                  void egoQuery.refetch();
                }}
              />
            ) : (
              <EgoNeighborhoodCanvas
                center={center}
                edges={egoQuery.data?.edges ?? NO_EGO_EDGES}
                shouldFillHeight={shouldFillHeight}
                onEditEdge={handleOpenEditById}
              />
            )}
          </div>
        )}
      </div>

      <ConnectionDialog
        open={dialog.mode === "create" || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog({ mode: "closed" });
            setSubmitError(null);
          }
        }}
        mode={editing === null ? "create" : "edit"}
        initial={editing}
        center={center}
        caseId={caseId}
        isBusy={dialogBusy}
        error={submitError}
        onSubmit={handleDialogSubmit}
      />

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove connection</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the edge from the Case graph. You can add it again
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldError>{deleteError}</FieldError>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (pendingDeleteId) {
                  deleteMutation.mutate({
                    ...scope,
                    edgeId: pendingDeleteId,
                  });
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DossierSection>
  );
}
