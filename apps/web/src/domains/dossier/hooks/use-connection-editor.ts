import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { ConnectionFormValues } from "@/domains/dossier/components/ego-graph/connection-dialog";
import { useCreateConnection } from "@/domains/dossier/hooks/use-create-connection";
import { useUpdateConnection } from "@/domains/dossier/hooks/use-update-connection";
import type { DossierEntityScope } from "@/domains/dossier/types";
import { edgeByIdQuery } from "@/domains/entities/edges/queries";
import type { EdgeRecord } from "@/domains/entities/edges/types";
import { edgeFromEntity } from "@/domains/entities/lib/connection-peers";

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; edge: EdgeRecord }
  /** The ego graph drew a Connection the list has not loaded: it is read by id first. */
  | { mode: "edit-by-id"; edgeId: string };

/**
 * The Connection dialog's state for one Entity: create, edit a loaded row, or edit a Connection
 * the ego graph drew but the list has not loaded (read by id, `edges.getMany`; a gone one is
 * `isEditGone`). Saves through the create and update mutations; a failed save keeps the dialog
 * open with `submitError`.
 */
export function useConnectionEditor(scope: DossierEntityScope) {
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const byIdQuery = useQuery(
    edgeByIdQuery(
      scope.caseId,
      dialog.mode === "edit-by-id" ? dialog.edgeId : null
    )
  );

  let editing: EdgeRecord | null = null;
  if (dialog.mode === "edit") editing = dialog.edge;
  if (dialog.mode === "edit-by-id" && byIdQuery.data) {
    editing = edgeFromEntity(byIdQuery.data, scope.entityId);
  }

  const close = () => {
    setDialog({ mode: "closed" });
    setSubmitError(null);
  };
  const open = (next: DialogState) => {
    setSubmitError(null);
    setDialog(next);
  };

  const createMutation = useCreateConnection({
    onCreated: close,
    onError: setSubmitError,
  });
  const updateMutation = useUpdateConnection({
    onUpdated: close,
    onError: setSubmitError,
    onReload: close,
  });

  async function submit(values: ConnectionFormValues) {
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

  return {
    editing,
    isOpen: dialog.mode === "create" || editing !== null,
    isClosed: dialog.mode === "closed",
    isEditGone: dialog.mode === "edit-by-id" && byIdQuery.data === null,
    isBusy: createMutation.isPending || updateMutation.isPending,
    submitError,
    handleOpenCreate: () => {
      open({ mode: "create" });
    },
    handleOpenEdit: (edge: EdgeRecord) => {
      open({ mode: "edit", edge });
    },
    /** A Connection by id: the loaded row when the list has it, else a read by id. */
    handleOpenEditById: (edgeId: string, loaded: readonly EdgeRecord[]) => {
      const edge = loaded.find((row) => row.id === edgeId);
      open(
        edge === undefined
          ? { mode: "edit-by-id", edgeId }
          : { mode: "edit", edge }
      );
    },
    handleClose: close,
    handleSubmit: submit,
  };
}
