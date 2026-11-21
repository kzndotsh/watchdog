import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";

import { collectProposalEvidenceIds } from "@/domains/triage/lib/evidence";
import type { AcceptFormValues } from "@/domains/triage/types";
import type { ProposalRecord } from "@watchdog/core/proposals";
import type { ConfidenceTier } from "@watchdog/domain/schemas/shared";

const DEFAULT_CONFIDENCE: ConfidenceTier = "unverified";

export function useTriageDetailForms(
  proposal: ProposalRecord | null,
  onAccept: (values: AcceptFormValues) => void,
  onReject: (reason: string) => void
) {
  const [isRejecting, setIsRejecting] = useState(false);

  // One form per Proposal: Triage keys `TriageDetail` on the selected Proposal's id, so another
  // selection remounts it and the unticked ops start empty (never another Proposal's).
  const defaultValues: AcceptFormValues = {
    confidence: DEFAULT_CONFIDENCE,
    evidenceIds: [],
    attestationText: "",
    skippedOpIds: [],
    untickedAs: "left",
  };
  const acceptForm = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      onAccept(value);
    },
  });

  const rejectForm = useForm({
    defaultValues: { rejectReason: "" },
    onSubmit: ({ value }) => {
      onReject(value.rejectReason);
    },
  });

  const linkedIds = useMemo(
    () => (proposal ? collectProposalEvidenceIds(proposal) : []),
    [proposal]
  );

  return {
    acceptForm,
    rejectForm,
    linkedIds,
    isRejecting,
    setRejecting: setIsRejecting,
  };
}

export type TriageAcceptForm = ReturnType<
  typeof useTriageDetailForms
>["acceptForm"];
export type TriageRejectForm = ReturnType<
  typeof useTriageDetailForms
>["rejectForm"];
