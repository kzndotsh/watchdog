import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useDumpEvidence } from "@/domains/intake/hooks/use-dump-evidence";
import {
  attachEvidenceEntityFn,
  enrichUrlEvidenceFn,
  processEvidenceFn,
  restoreEvidenceFn,
  softDeleteEvidenceFn,
} from "@/domains/intake/intake.functions";
import {
  attachEvidenceEntityInputSchema,
  evidenceScopeInputSchema,
  processEvidenceInputSchema,
} from "@/domains/intake/types";
import { errMessage } from "@/lib/utils";
import {
  invalidateAfterEvidenceMutation,
  invalidateAfterJobMutation,
} from "@/shared/lib/query-invalidation";

type IntakePending = null | {
  kind: "harvest" | "extract" | "enrich";
  evidenceId: string;
};

export interface IntakeEvidenceActions {
  busy: boolean;
  processing: boolean;
  aiProcessing: boolean;
  enriching: boolean;
  attaching: boolean;
  onProcess: () => void;
  onAiProcess: () => void;
  onEnrich: () => void;
  onHide: () => void;
  onRestore: () => void;
  onAttachEntity: (entityId: string) => void;
}

export interface UseIntakeActionsOptions {
  caseId: string;
  selectedEvidenceId: string | null;
  onEvidenceIdChange: (next: string | null) => void;
  resolveSelectionAfterHide?: (hiddenEvidenceId: string) => string | null;
  closeDumpModal: () => void;
  onRestoreShowActiveQueue: () => void;
}

export function useIntakeActions({
  caseId,
  selectedEvidenceId,
  onEvidenceIdChange,
  resolveSelectionAfterHide,
  closeDumpModal,
  onRestoreShowActiveQueue,
}: UseIntakeActionsOptions) {
  const queryClient = useQueryClient();

  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<IntakePending>(null);
  const [entityId, setEntityId] = useState("");

  const dump = useDumpEvidence({
    caseId,
    entityId,
    onSuccess: (created) => {
      closeDumpModal();
      onEvidenceIdChange(created.at(-1)?.id ?? null);
    },
  });

  const processMutation = useMutation({
    mutationFn: async (input: { evidenceId: string; ai?: boolean }) =>
      processEvidenceFn({
        data: processEvidenceInputSchema.parse({
          caseId,
          evidenceId: input.evidenceId,
          ai: input.ai ?? false,
        }),
      }),
    onSuccess: async (_result, input) => {
      onEvidenceIdChange(input.evidenceId);
      await invalidateAfterJobMutation(queryClient, caseId);
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, "Harvest/Extract failed"));
    },
    onSettled: () => {
      setPending(null);
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async (id: string) =>
      enrichUrlEvidenceFn({
        data: evidenceScopeInputSchema.parse({ caseId, evidenceId: id }),
      }),
    onSuccess: async (_result, id) => {
      onEvidenceIdChange(id);
      await invalidateAfterJobMutation(queryClient, caseId);
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, "Enrich failed"));
    },
    onSettled: () => {
      setPending(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      softDeleteEvidenceFn({
        data: evidenceScopeInputSchema.parse({ caseId, evidenceId: id }),
      }),
    onSuccess: async (_ok, id) => {
      onEvidenceIdChange(resolveSelectionAfterHide?.(id) ?? null);
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, "Hide failed"));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) =>
      restoreEvidenceFn({
        data: evidenceScopeInputSchema.parse({ caseId, evidenceId: id }),
      }),
    onSuccess: async (_ok, id) => {
      onRestoreShowActiveQueue();
      onEvidenceIdChange(id);
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, "Restore failed"));
    },
  });

  const attachMutation = useMutation({
    mutationFn: async (input: { evidenceId: string; entityId: string }) =>
      attachEvidenceEntityFn({
        data: attachEvidenceEntityInputSchema.parse({
          caseId,
          evidenceId: input.evidenceId,
          entityId: input.entityId,
        }),
      }),
    onSuccess: async () => {
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, "Attach failed"));
    },
  });

  const { clearDumpError } = dump;
  const busy = dump.busy || pending !== null;

  const evidenceActions = useMemo<IntakeEvidenceActions>(() => {
    const pendingForSelected =
      pending !== null && pending.evidenceId === selectedEvidenceId
        ? pending.kind
        : null;

    return {
      busy,
      processing: pendingForSelected === "harvest",
      aiProcessing: pendingForSelected === "extract",
      enriching: pendingForSelected === "enrich",
      onProcess: () => {
        if (!selectedEvidenceId) return;
        setPending({ kind: "harvest", evidenceId: selectedEvidenceId });
        setActionError(null);
        clearDumpError();
        processMutation.mutate({ evidenceId: selectedEvidenceId });
      },
      onAiProcess: () => {
        if (!selectedEvidenceId) return;
        setPending({ kind: "extract", evidenceId: selectedEvidenceId });
        setActionError(null);
        clearDumpError();
        processMutation.mutate({ evidenceId: selectedEvidenceId, ai: true });
      },
      onEnrich: () => {
        if (!selectedEvidenceId) return;
        setPending({ kind: "enrich", evidenceId: selectedEvidenceId });
        setActionError(null);
        clearDumpError();
        enrichMutation.mutate(selectedEvidenceId);
      },
      onHide: () => {
        if (!selectedEvidenceId) return;
        setActionError(null);
        clearDumpError();
        deleteMutation.mutate(selectedEvidenceId);
      },
      onRestore: () => {
        if (!selectedEvidenceId) return;
        setActionError(null);
        clearDumpError();
        restoreMutation.mutate(selectedEvidenceId);
      },
      attaching: attachMutation.isPending,
      onAttachEntity: (nextEntityId: string) => {
        if (!selectedEvidenceId) return;
        setActionError(null);
        clearDumpError();
        attachMutation.mutate({
          evidenceId: selectedEvidenceId,
          entityId: nextEntityId,
        });
      },
    };
  }, [
    busy,
    pending,
    selectedEvidenceId,
    processMutation,
    enrichMutation,
    deleteMutation,
    restoreMutation,
    attachMutation,
    clearDumpError,
  ]);

  return {
    actionError: actionError ?? dump.dumpError,
    entityId,
    setEntityId,
    busy,
    uploading: dump.uploading,
    uploadStatus: dump.uploadStatus,
    dumpingPaste: dump.dumpingPaste,
    dumpingUrl: dump.dumpingUrl,
    onFiles: dump.onFiles,
    onPaste: dump.onPaste,
    onUrl: dump.onUrl,
    evidenceActions,
  };
}
