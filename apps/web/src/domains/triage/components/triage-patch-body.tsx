import { useMemo } from "react";

import { LazyEvidencePreviewDrawer } from "@/domains/triage/components/evidence-preview-drawer-lazy";
import { PatchOpList } from "@/domains/triage/components/patch-op-list";
import { TriageDecideFooter } from "@/domains/triage/components/triage-decide-footer";
import type {
  TriageAcceptForm,
  TriageRejectForm,
} from "@/domains/triage/hooks/use-triage-detail-forms";
import { proposalPatch } from "@/domains/triage/lib/filters";
import { cn } from "@/lib/utils";
import type { PickerPort } from "@/shared/hooks/use-picker-source";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { EntityMention } from "@/shared/ui/entity-mention";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { listInvalidIdentifierOps, patchOpText } from "@watchdog/schemas/graph";
import { normalizeUuidList } from "@watchdog/schemas/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@watchdog/ui/components/alert";

function summaryIsRedundant(proposal: ProposalRecord): boolean {
  const summary = proposal.summary?.trim();
  if (!summary) return true;
  return proposalPatch(proposal).some((op) => {
    if (op.resource !== "claim" && op.resource !== "question") return false;
    const text = patchOpText(op);
    return text !== undefined && text.trim() === summary;
  });
}

type TriagePatchBodyProps = {
  proposal: ProposalRecord;
  caseId: string;
  acceptForm: TriageAcceptForm;
  rejectForm: TriageRejectForm;
  linkedIds: string[];
  /** The Case's Evidence picker reads (`evidencePickerPort(caseId)`). */
  evidencePort: PickerPort<EvidenceOption>;
  missingJobEvidenceCount: number;
  isEvidenceLoading: boolean;
  isEvidencePlaceholder?: boolean;
  /** Titles of the Evidence the Proposal cites, by id. */
  evidenceById: ReadonlyMap<string, EvidenceOption>;
  evidenceLoadError: string | null;
  onRetryEvidence?: () => void;
  isPending: boolean;
  error: string | null;
  isRejecting: boolean;
  onRejectingChange: (rejecting: boolean) => void;
  previewEvidenceId: string | null;
  onPreviewEvidenceChange: (evidenceId: string | null) => void;
};

export function TriagePatchBody({
  proposal,
  caseId,
  acceptForm,
  rejectForm,
  linkedIds,
  evidencePort,
  missingJobEvidenceCount,
  isEvidenceLoading,
  isEvidencePlaceholder = false,
  evidenceById,
  evidenceLoadError,
  onRetryEvidence,
  isPending,
  error,
  isRejecting,
  onRejectingChange,
  previewEvidenceId,
  onPreviewEvidenceChange,
}: TriagePatchBodyProps) {
  const shouldShowSummary = !summaryIsRedundant(proposal);
  const collisions = proposal.identifierCollisions ?? [];
  const patch = proposalPatch(proposal);
  const invalidIdentifierOps = listInvalidIdentifierOps(patch);
  const hasInvalidIdentifierOps = invalidIdentifierOps.length > 0;
  const citedEvidence = useMemo(
    () =>
      linkedIds.flatMap((id) => {
        const row = evidenceById.get(id);
        return row === undefined ? [] : [row];
      }),
    [linkedIds, evidenceById]
  );

  return (
    <>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 py-3",
          placeholderDeemphasisClass(isEvidencePlaceholder)
        )}
      >
        <div className="flex flex-col gap-3">
          {shouldShowSummary &&
          proposal.summary !== null &&
          proposal.summary !== "" ? (
            <div className="bg-muted/30 rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">Summary</p>
              <p className="mt-0.5 text-sm leading-relaxed text-pretty">
                {proposal.summary}
              </p>
            </div>
          ) : null}

          {evidenceLoadError ? (
            <FetchErrorAlert
              error={evidenceLoadError}
              onRetry={onRetryEvidence}
            />
          ) : null}

          {hasInvalidIdentifierOps ? (
            <Alert>
              <AlertTitle>Invalid Identifier values</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 flex flex-col gap-1">
                  {invalidIdentifierOps.map((hit) => (
                    <li key={hit.opId}>
                      <span className="text-foreground">
                        {kindLabel(hit.type)}: {hit.value || "(empty)"}
                      </span>
                      {" — "}
                      {hit.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {collisions.length > 0 ? (
            <Alert>
              <AlertTitle>Already on another Entity</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 flex flex-col gap-1">
                  {collisions.map((hit) => (
                    <li key={`${hit.opId}-${hit.entityId}`}>
                      <span className="text-foreground">
                        {kindLabel(hit.type)}: {hit.value}
                      </span>
                      {" on "}
                      <EntityMention
                        name={hit.entityName}
                        slug={hit.entitySlug}
                        size="sm"
                      />
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <acceptForm.Subscribe selector={(state) => state.values.evidenceIds}>
            {(evidenceIds) => (
              <PatchOpList
                patch={patch}
                collidingOpIds={collisions.map((hit) => hit.opId)}
                invalidOpIds={invalidIdentifierOps.map((hit) => hit.opId)}
                sharedEvidenceIds={normalizeUuidList([
                  ...proposal.evidenceIds,
                  ...evidenceIds,
                ])}
                evidenceById={evidenceById}
                onEvidenceClick={onPreviewEvidenceChange}
                jobId={proposal.jobId}
              />
            )}
          </acceptForm.Subscribe>
        </div>
      </div>

      <TriageDecideFooter
        proposal={proposal}
        acceptForm={acceptForm}
        rejectForm={rejectForm}
        linkedIds={linkedIds}
        citedEvidence={citedEvidence}
        evidencePort={evidencePort}
        missingJobEvidenceCount={missingJobEvidenceCount}
        isEvidenceLoading={isEvidenceLoading}
        isPending={isPending}
        error={error}
        isRejecting={isRejecting}
        onRejectingChange={onRejectingChange}
      />

      <LazyEvidencePreviewDrawer
        evidenceId={previewEvidenceId}
        caseId={caseId}
        onClose={() => {
          onPreviewEvidenceChange(null);
        }}
      />
    </>
  );
}
