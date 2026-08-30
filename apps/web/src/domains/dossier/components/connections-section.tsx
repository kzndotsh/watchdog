import { useMutation, useSuspenseQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionAddButton } from "@/domains/dossier/components/dossier-section-add-button";
import { ConnectionDialog } from "@/domains/dossier/components/ego-graph/connection-dialog";
import type { ConnectionFormValues } from "@/domains/dossier/components/ego-graph/connection-dialog";
import { CompactConnectionList } from "@/domains/dossier/components/ego-graph/connection-list";
import { EgoNeighborhoodCanvas } from "@/domains/dossier/components/ego-graph/ego-neighborhood-canvas";
import { useInvalidateEntity } from "@/domains/dossier/hooks/use-invalidate-entity";
import type { DossierSectionWithEvidenceProps } from "@/domains/dossier/types";
import {
  createEdgeFn,
  deleteEdgeFn,
  updateEdgeFn,
  type EdgeRecord,
} from "@/domains/entities/edges/edges.functions";
import { edgesListQuery } from "@/domains/entities/edges/queries";
import {
  buildCreateEdgeData,
  buildUpdateEdgeData,
} from "@/domains/entities/lib/edge-write";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/shadcn/alert-dialog";

export type ConnectionsSectionProps = DossierSectionWithEvidenceProps & {
  entity: Pick<EntityRecord, "id" | "name" | "slug" | "kind">;
  fillHeight?: boolean;
};

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; edge: EdgeRecord };

export function ConnectionsSection({
  caseId,
  entityId,
  entitySlug,
  entity,
  evidenceOptions,
  emptyPresentation = "inline",
  fillHeight = false,
}: ConnectionsSectionProps) {
  const invalidate = useInvalidateEntity({ caseId, entityId, entitySlug });
  const [{ data: rows }, { data: entitiesRaw }] = useSuspenseQueries({
    queries: [edgesListQuery(caseId, entityId), entitiesListQuery(caseId)],
  });

  const entities = useMemo(
    () => entitiesRaw.filter((e) => e.id !== entityId),
    [entitiesRaw, entityId]
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (values: ConnectionFormValues) =>
      createEdgeFn({
        data: buildCreateEdgeData({
          caseId,
          centerId: entityId,
          core: {
            peerId: values.peerId,
            predicate: values.predicate,
            orientation: values.orientation,
            notes: values.notes,
          },
          confidence: values.confidence,
          evidenceIds: values.evidenceIds,
        }),
      }),
    onSuccess: async () => {
      toast.success("Connection added");
      setDialog({ mode: "closed" });
      setSubmitError(null);
      await invalidate();
    },
    onError: (e) => {
      setSubmitError(errMessage(e, "Failed to add"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      edge,
      values,
    }: {
      edge: EdgeRecord;
      values: ConnectionFormValues;
    }) =>
      updateEdgeFn({
        data: buildUpdateEdgeData({
          caseId,
          centerId: entityId,
          edgeId: edge.id,
          core: {
            peerId: values.peerId,
            predicate: values.predicate,
            orientation: values.orientation,
            notes: values.notes,
          },
          existing: {
            fromId: edge.fromId,
            toId: edge.toId,
            peerId: edge.peerId,
          },
          confidence: values.confidence,
          evidenceIds: values.evidenceIds,
        }),
      }),
    onSuccess: async () => {
      toast.success("Connection updated");
      setDialog({ mode: "closed" });
      setSubmitError(null);
      await invalidate();
    },
    onError: (e) => {
      setSubmitError(errMessage(e, "Update failed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (edgeId: string) =>
      deleteEdgeFn({ data: { caseId, edgeId } }),
    onSuccess: async () => {
      setPendingDeleteId(null);
      await invalidate();
      toast.success("Connection deleted");
    },
    onError: (e) => {
      toast.error(errMessage(e, "Delete failed"));
      setPendingDeleteId(null);
    },
  });

  function handleOpenCreate() {
    setSubmitError(null);
    setDialog({ mode: "create" });
  }

  function openEdit(edge: EdgeRecord) {
    setSubmitError(null);
    setDialog({ mode: "edit", edge });
  }

  function openEditById(edgeId: string) {
    const edge = rows.find((r) => r.id === edgeId);
    if (edge) openEdit(edge);
  }

  async function handleDialogSubmit(values: ConnectionFormValues) {
    try {
      if (dialog.mode === "create") {
        await createMutation.mutateAsync(values);
        return;
      }
      if (dialog.mode === "edit") {
        await updateMutation.mutateAsync({ edge: dialog.edge, values });
      }
    } catch {
      // onError already set submitError — keep dialog open
    }
  }

  const isEmpty = rows.length === 0 && dialog.mode === "closed";
  const dialogBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <DossierSection
      title="Connections"
      empty={isEmpty}
      emptyPresentation={emptyPresentation}
      emptyItems="connections"
      emptyText="No connections to other entities yet."
      emptyDescription="Link this entity to another in the Case."
      emptyAction={
        emptyPresentation === "panel" ? (
          <DossierSectionAddButton
            variant="panel"
            noun="connection"
            onClick={handleOpenCreate}
          />
        ) : undefined
      }
      actions={
        <DossierSectionAddButton variant="ghost" onClick={handleOpenCreate} />
      }
      className={fillHeight ? "min-h-0 flex-1" : undefined}
    >
      <div
        className={
          fillHeight
            ? "flex min-h-0 flex-1 flex-col gap-3"
            : "flex flex-col gap-3 pb-4"
        }
      >
        <CompactConnectionList
          outbound={outRows}
          inbound={inRows}
          onEdit={openEdit}
          onRemove={setPendingDeleteId}
          className={fillHeight ? "max-h-72" : undefined}
        />
        <EgoNeighborhoodCanvas
          center={{
            id: entity.id,
            name: entity.name,
            slug: entity.slug,
            kind: entity.kind,
          }}
          edges={rows}
          fillHeight={fillHeight}
          onEditEdge={openEditById}
        />
      </div>

      <ConnectionDialog
        open={dialog.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) {
            setDialog({ mode: "closed" });
            setSubmitError(null);
          }
        }}
        mode={dialog.mode === "edit" ? "edit" : "create"}
        initial={dialog.mode === "edit" ? dialog.edge : null}
        center={{
          id: entity.id,
          name: entity.name,
          kind: entity.kind,
        }}
        entities={entities}
        evidenceOptions={evidenceOptions}
        busy={dialogBusy}
        error={submitError}
        onSubmit={handleDialogSubmit}
      />

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
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
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (pendingDeleteId) {
                  deleteMutation.mutate(pendingDeleteId);
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
