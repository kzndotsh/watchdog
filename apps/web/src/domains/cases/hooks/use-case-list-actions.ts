import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";

import { setActiveCaseIdFn } from "@/domains/cases/cases.functions";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import type { CaseRecord } from "@/domains/cases/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";

function selectActiveCase(caseId: string) {
  return setActiveCaseIdFn({ data: { caseId } });
}

async function onCaseSelected(queryClient: ReturnType<typeof useQueryClient>) {
  await invalidateAfterCaseSwitch(queryClient);
  notifyCasesChanged();
}

function onCaseSelectError(
  setSubmitError: Dispatch<SetStateAction<string | null>>,
  err: unknown
): void {
  setSubmitError(errMessage(err, "Failed to switch case"));
}

async function navigateToCase(
  navigate: ReturnType<typeof useNavigate>,
  caseRow: CaseRecord
) {
  await navigate({
    to: "/cases/$caseSlug",
    params: { caseSlug: caseRow.slug },
  });
}

async function handleCreateSuccessAsync(
  queryClient: ReturnType<typeof useQueryClient>,
  setSubmitError: Dispatch<SetStateAction<string | null>>
): Promise<void> {
  setSubmitError(null);
  toast.success("Case created");
  await invalidateAfterCaseSwitch(queryClient);
  notifyCasesChanged();
}

function buildCaseListActionHandlers(
  activeId: string,
  navigate: ReturnType<typeof useNavigate>,
  queryClient: ReturnType<typeof useQueryClient>,
  setSubmitError: Dispatch<SetStateAction<string | null>>,
  setCreateOpen: Dispatch<SetStateAction<boolean>>,
  setDeleteTarget: Dispatch<SetStateAction<CaseRecord | null>>,
  setSearch: Dispatch<SetStateAction<string>>,
  selectMutation: {
    mutate: (id: string) => void;
    mutateAsync: (id: string) => Promise<unknown>;
  }
) {
  return {
    selectCase: (id: string) => {
      setSubmitError(null);
      selectMutation.mutate(id);
    },
    openCase: async (caseRow: CaseRecord) => {
      setSubmitError(null);
      try {
        if (caseRow.id !== activeId) {
          await selectMutation.mutateAsync(caseRow.id);
        }
        await navigateToCase(navigate, caseRow);
      } catch (error) {
        setSubmitError(errMessage(error, "Failed to open case"));
      }
    },
    openCreate: () => {
      setSubmitError(null);
      setCreateOpen(true);
    },
    clearSearch: () => {
      setSearch("");
    },
    beginDeleteCase: (caseRow: CaseRecord) => {
      setSubmitError(null);
      setDeleteTarget(caseRow);
    },
    handleCreateSuccess: () => {
      void handleCreateSuccessAsync(queryClient, setSubmitError);
    },
    handleCreateError: (message: string) => {
      setSubmitError(message);
    },
    closeDeleteDialog: (open: boolean) => {
      if (!open) setDeleteTarget(null);
    },
    handleCaseDeleted: () => {
      toast.success("Case deleted");
    },
  };
}

export function useCaseListActions(
  activeId: string,
  setSubmitError: Dispatch<SetStateAction<string | null>>,
  setCreateOpen: Dispatch<SetStateAction<boolean>>,
  setDeleteTarget: Dispatch<SetStateAction<CaseRecord | null>>,
  setSearch: Dispatch<SetStateAction<string>>
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const selectMutation = useMutation({
    mutationFn: selectActiveCase,
    onSuccess: async () => onCaseSelected(queryClient),
    onError: (err) => {
      onCaseSelectError(setSubmitError, err);
    },
  });

  return {
    selecting: selectMutation.isPending,
    ...buildCaseListActionHandlers(
      activeId,
      navigate,
      queryClient,
      setSubmitError,
      setCreateOpen,
      setDeleteTarget,
      setSearch,
      selectMutation
    ),
  };
}
