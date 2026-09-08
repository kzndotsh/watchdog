import { EvidencePreviewDrawer } from "@/domains/dossier/components/evidence-preview-drawer";
import type { EvidenceRecord } from "@/domains/intake/types";
import { PatchOpList } from "@/domains/triage/components/patch-op-list";
import { TriageDecideFooter } from "@/domains/triage/components/triage-decide-footer";
import type {
  TriageAcceptForm,
  TriageRejectForm,
} from "@/domains/triage/hooks/use-triage-detail-forms";
import { proposalPatch } from "@/domains/triage/lib/filters";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { cn } from "@/lib/utils";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { EntityMention } from "@/shared/ui/entity-mention";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/shadcn/alert";
import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import {
  listInvalidIdentifierOps,
  normalizeUuidList,
  patchOpText,
} from "@watchdog/schemas";

function summaryIsRedundant(proposal: ProposalRecord): boolean {
  const summary = proposal.summary?.trim();
  if (!summary) return true;
  return proposalPatch(proposal).some((op) => {
    if (op.resource !== "claim" && op.resource !== "question") return false;
    const text = patchOpText(op);
    return text !== undefined && text.trim() === summary;
  });
}

interface TriagePatchBodyProps {
  proposal: ProposalRecord;
  caseId: string;
  acceptForm: TriageAcceptForm;
  rejectForm: TriageRejectForm;
  linkedIds: string[];
  caseEvidence: EvidenceRecord[];
  missingJobEvidenceCount: number;
  evidenceLoading: boolean;
  evidencePlaceholder?: boolean;
  evidenceById: Map<string, EvidenceRecord>;
  evidenceLoadError: string | null;
  onRetryEvidence?: () => void;
  pending: boolean;
  error: string | null;
  rejecting: boolean;
  onRejectingChange: (rejecting: boolean) => void;
  previewEvidence: EvidenceRecord | null;
  onPreviewEvidenceChange: (evidence: EvidenceRecord | null) => void;
}

export function TriagePatchBody({
  proposal,
  caseId,
  acceptForm,
  rejectForm,
  linkedIds,
  caseEvidence,
  missingJobEvidenceCount,
  evidenceLoading,
  evidencePlaceholder = false,
  evidenceById,
  evidenceLoadError,
  onRetryEvidence,
  pending,
  error,
  rejecting,
  onRejectingChange,
  previewEvidence,
  onPreviewEvidenceChange,
}: TriagePatchBodyProps) {
  const showSummary = !summaryIsRedundant(proposal);
  const collisions = proposal.identifierCollisions ?? [];
  const patch = proposalPatch(proposal);
  const invalidIdentifierOps = listInvalidIdentifierOps(patch);
  const hasInvalidIdentifierOps = invalidIdentifierOps.length > 0;

  return (
    <>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 py-3",
          placeholderDeemphasisClass(evidencePlaceholder)
        )}
      >
        <div className="flex flex-col gap-3">
          {showSummary &&
          proposal.summary !== null &&
          proposal.summary !== "" ? (
            <div className="bg-muted/30 rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs font-medium">
                Summary
              </p>
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
                      <span className="text-foreground font-medium">
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
                      <span className="text-foreground font-medium">
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
        caseEvidence={caseEvidence}
        missingJobEvidenceCount={missingJobEvidenceCount}
        evidenceLoading={evidenceLoading}
        pending={pending}
        error={error}
        rejecting={rejecting}
        onRejectingChange={onRejectingChange}
      />

      <EvidencePreviewDrawer
        evidence={previewEvidence}
        caseId={caseId}
        onClose={() => {
          onPreviewEvidenceChange(null);
        }}
      />
    </>
  );
}
