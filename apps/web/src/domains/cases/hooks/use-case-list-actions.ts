import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";

import { useSelectActiveCase } from "@/domains/cases/hooks/use-select-active-case";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import type { CaseRecord } from "@/domains/cases/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";

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
      if (caseRow.id !== activeId) {
        // The switch hook already reported its failure; do not navigate past it.
        const switched = await selectMutation
          .mutateAsync(caseRow.id)
          .then(() => true)
          .catch(() => false);
        if (!switched) return;
      }
      try {
        await navigateToCase(navigate, caseRow);
      } catch (error) {
        setSubmitError(errMessage(error, "Couldn't open Case."));
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
  cases: CaseRecord[],
  activeId: string,
  setSubmitError: Dispatch<SetStateAction<string | null>>,
  setCreateOpen: Dispatch<SetStateAction<boolean>>,
  setDeleteTarget: Dispatch<SetStateAction<CaseRecord | null>>,
  setSearch: Dispatch<SetStateAction<string>>
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const selectMutation = useSelectActiveCase({ cases });

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
