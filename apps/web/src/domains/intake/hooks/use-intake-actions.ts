import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  invalidateAfterEvidenceMutation,
  invalidateAfterJobMutation,
} from "@/app/lib/query-invalidation";
import { useDumpEvidence } from "@/domains/intake/hooks/use-dump-evidence";
import { orpc } from "@/lib/orpc-client";
import { couldnt, errMessage } from "@/lib/utils";
import {
  attachEvidenceEntityInputSchema,
  processEvidenceInputSchema,
} from "@watchdog/domain/schemas/evidence";
import { evidenceScopeInputSchema } from "@watchdog/domain/schemas/graph";

type IntakePending = null | {
  kind: "harvest" | "extract" | "enrich";
  evidenceId: string;
};

export type IntakeEvidenceActions = {
  isBusy: boolean;
  isProcessing: boolean;
  isAiProcessing: boolean;
  isEnriching: boolean;
  isAttaching: boolean;
  onProcess: () => void;
  onAiProcess: () => void;
  onEnrich: () => void;
  onHide: () => void;
  onRestore: () => void;
  onAttachEntity: (entityId: string) => void;
};

export type UseIntakeActionsOptions = {
  caseId: string;
  selectedEvidenceId: string | null;
  onEvidenceIdChange: (next: string | null) => void;
  resolveSelectionAfterHide?: (hiddenEvidenceId: string) => string | null;
  closeDumpModal: () => void;
  onRestoreShowActiveQueue: () => void;
};

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
    mutationFn: async (input: { evidenceId: string; isAi?: boolean }) =>
      orpc.evidence.process.call(
        processEvidenceInputSchema.parse({
          caseId,
          evidenceId: input.evidenceId,
          ai: input.isAi ?? false,
        })
      ),
    onSuccess: async (_result, input) => {
      onEvidenceIdChange(input.evidenceId);
      await invalidateAfterJobMutation(queryClient, caseId);
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, couldnt("harvest or extract", "evidence")));
    },
    onSettled: () => {
      setPending(null);
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async (id: string) =>
      orpc.evidence.enrich.call(
        evidenceScopeInputSchema.parse({ caseId, evidenceId: id })
      ),
    onSuccess: async (_result, id) => {
      onEvidenceIdChange(id);
      await invalidateAfterJobMutation(queryClient, caseId);
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, couldnt("enrich", "evidence")));
    },
    onSettled: () => {
      setPending(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      orpc.evidence.softDelete.call(
        evidenceScopeInputSchema.parse({ caseId, evidenceId: id })
      ),
    onSuccess: async (_ok, id) => {
      onEvidenceIdChange(resolveSelectionAfterHide?.(id) ?? null);
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, couldnt("hide", "evidence")));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) =>
      orpc.evidence.restore.call(
        evidenceScopeInputSchema.parse({ caseId, evidenceId: id })
      ),
    onSuccess: async (_ok, id) => {
      onRestoreShowActiveQueue();
      onEvidenceIdChange(id);
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, couldnt("restore", "evidence")));
    },
  });

  const attachMutation = useMutation({
    mutationFn: async (input: { evidenceId: string; entityId: string }) =>
      orpc.evidence.attachEntity.call(
        attachEvidenceEntityInputSchema.parse({
          caseId,
          evidenceId: input.evidenceId,
          entityId: input.entityId,
        })
      ),
    onSuccess: async () => {
      await invalidateAfterEvidenceMutation(queryClient, caseId);
    },
    onError: (e) => {
      setActionError(errMessage(e, couldnt("attach", "evidence")));
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
      isBusy: busy,
      isProcessing: pendingForSelected === "harvest",
      isAiProcessing: pendingForSelected === "extract",
      isEnriching: pendingForSelected === "enrich",
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
        processMutation.mutate({ evidenceId: selectedEvidenceId, isAi: true });
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
      isAttaching: attachMutation.isPending,
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
