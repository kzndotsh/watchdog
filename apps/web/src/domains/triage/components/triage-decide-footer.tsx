import { CheckIcon, GaugeIcon, XIcon } from "lucide-react";

import {
  EvidenceCiteChips,
  EvidencePicker,
  EvidenceSlotSkeleton,
} from "@/domains/dossier/components/evidence-picker";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@/domains/dossier/lib/confirmed-evidence";
import type { EvidenceRecord } from "@/domains/intake/types";
import { AcceptGateMessage } from "@/domains/triage/components/accept-gate-message";
import type {
  TriageAcceptForm,
  TriageRejectForm,
} from "@/domains/triage/hooks/use-triage-detail-forms";
import { acceptGate, gatedAcceptInput } from "@/domains/triage/lib/accept-gate";
import {
  isConfirmedWithoutBundle,
  totalEvidenceCount,
} from "@/domains/triage/lib/accept-validation";
import {
  buildDecideHeaderView,
  type DecideEvidenceMode,
} from "@/domains/triage/lib/decide-header-view";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { ConfidenceSelect } from "@/shared/ui/confidence-select";
import { DetailFooter } from "@/shared/ui/detail-footer";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { Button } from "@/shared/ui/shadcn/button";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { WithTooltip } from "@/shared/ui/timestamp";
import { patchNeedsConfidence } from "@watchdog/policy/patch-needs-confidence";

function JobEvidenceMissingHint({ missingCount }: { missingCount: number }) {
  if (missingCount < 1) return null;
  return (
    <p className="text-muted-foreground text-xs">
      {missingCount} Job evidence id
      {missingCount === 1 ? "" : "s"} linked on Accept but not in this Case list
      (hidden or other Case).
    </p>
  );
}

function renderAcceptEvidenceSlot({
  evidenceLoading,
  evidenceMode,
  linkedIds,
  caseEvidence,
  acceptForm,
}: {
  evidenceLoading: boolean;
  evidenceMode: DecideEvidenceMode;
  linkedIds: string[];
  caseEvidence: EvidenceRecord[];
  acceptForm: TriageAcceptForm;
}) {
  if (evidenceLoading) {
    return (
      <EvidenceSlotSkeleton mode={evidenceMode} citeCount={linkedIds.length} />
    );
  }
  if (evidenceMode === "cite") {
    return (
      <EvidenceCiteChips withIcon options={caseEvidence} ids={linkedIds} />
    );
  }
  return (
    <acceptForm.Field
      name="evidenceIds"
      validators={{
        onChangeListenTo: ["confidence"],
        onChange: ({ value, fieldApi }) => {
          const confidence = fieldApi.form.getFieldValue("confidence");
          if (isConfirmedWithoutBundle(confidence, value, [], "")) {
            return CONFIRMED_REQUIRES_EVIDENCE;
          }
          // oxlint-disable-next-line unicorn/no-useless-undefined -- TanStack Form: undefined = valid
          return undefined;
        },
      }}
    >
      {(field) => (
        <EvidencePicker
          dashedWhenEmpty
          options={caseEvidence}
          selectedIds={field.state.value}
          onChange={(ids) => {
            field.handleChange(ids);
          }}
        />
      )}
    </acceptForm.Field>
  );
}

function AcceptWarnings({
  acceptForm,
  linkedIds,
}: {
  acceptForm: TriageAcceptForm;
  linkedIds: string[];
}) {
  return (
    <acceptForm.Subscribe
      selector={(state) => ({
        confidence: state.values.confidence,
        evidenceIds: state.values.evidenceIds,
        attestationText: state.values.attestationText,
      })}
    >
      {({ confidence, evidenceIds, attestationText }) => {
        const totalEvidence = totalEvidenceCount(
          evidenceIds,
          linkedIds,
          attestationText
        );
        const confirmedWithoutBundle = isConfirmedWithoutBundle(
          confidence,
          evidenceIds,
          linkedIds,
          attestationText
        );
        const zeroEvidenceWarn =
          confidence !== "confirmed" && totalEvidence === 0;

        return (
          <AcceptGateMessage
            confirmedWithoutBundle={confirmedWithoutBundle}
            zeroEvidenceWarn={zeroEvidenceWarn}
          />
        );
      }}
    </acceptForm.Subscribe>
  );
}

function AcceptControls({
  acceptForm,
  linkedIds,
  caseEvidence,
  missingJobEvidenceCount,
  evidenceLoading,
  evidenceMode,
  showAttestation,
}: {
  acceptForm: TriageAcceptForm;
  linkedIds: string[];
  caseEvidence: EvidenceRecord[];
  missingJobEvidenceCount: number;
  evidenceLoading: boolean;
  evidenceMode: DecideEvidenceMode;
  showAttestation: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <WithTooltip content="Confidence" wrapSpan className="inline-flex">
            <GaugeIcon
              aria-hidden
              className="text-muted-foreground size-3.5 shrink-0"
            />
          </WithTooltip>
          <acceptForm.Field name="confidence">
            {(field) => (
              <ConfidenceSelect
                value={field.state.value}
                onChange={(next) => {
                  field.handleChange(next);
                }}
              />
            )}
          </acceptForm.Field>
        </div>
        {renderAcceptEvidenceSlot({
          evidenceLoading,
          evidenceMode,
          linkedIds,
          caseEvidence,
          acceptForm,
        })}
      </div>
      <JobEvidenceMissingHint missingCount={missingJobEvidenceCount} />
      {showAttestation ? (
        <acceptForm.Field name="attestationText">
          {(field) => (
            <Textarea
              placeholder="Optional attestation note (creates Evidence on Accept)"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              className="min-h-10 w-full text-xs"
            />
          )}
        </acceptForm.Field>
      ) : null}
      <AcceptWarnings acceptForm={acceptForm} linkedIds={linkedIds} />
    </div>
  );
}

function RejectComposer({
  rejectForm,
  pending,
  rejecting,
  onRejectingChange,
}: {
  rejectForm: TriageRejectForm;
  pending: boolean;
  rejecting: boolean;
  onRejectingChange: (rejecting: boolean) => void;
}) {
  return (
    <ComposerShell density="dense" className="w-full gap-1.5">
      <rejectForm.Field name="rejectReason">
        {(field) => (
          <Textarea
            placeholder="Reject reason (optional)"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => {
              field.handleChange(e.target.value);
            }}
            className="min-h-10 text-xs"
            autoFocus
          />
        )}
      </rejectForm.Field>
      <p className="text-muted-foreground text-xs leading-snug">
        Rejected findings are remembered — Cap re-runs will skip them instead of
        re-proposing.
      </p>
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-xs"
          disabled={pending}
          onClick={() => {
            onRejectingChange(false);
            rejectForm.reset();
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-6 text-xs"
          loading={pending && rejecting}
          onClick={() => {
            void rejectForm.handleSubmit();
          }}
        >
          Confirm Reject
        </Button>
      </div>
    </ComposerShell>
  );
}

export function TriageDecideFooter({
  proposal,
  acceptForm,
  rejectForm,
  linkedIds,
  caseEvidence,
  missingJobEvidenceCount,
  evidenceLoading,
  pending,
  error,
  rejecting,
  onRejectingChange,
}: {
  proposal: ProposalRecord;
  acceptForm: TriageAcceptForm;
  rejectForm: TriageRejectForm;
  linkedIds: string[];
  caseEvidence: EvidenceRecord[];
  missingJobEvidenceCount: number;
  evidenceLoading: boolean;
  pending: boolean;
  error: string | null;
  rejecting: boolean;
  onRejectingChange: (rejecting: boolean) => void;
}) {
  const view = buildDecideHeaderView({
    proposal,
    linkedIds,
    rejecting,
  });
  const needsConfidence = patchNeedsConfidence(proposal.patch);
  const acceptBusy = pending && view.decideMode === "accepting";

  if (view.showRejectComposer) {
    return (
      <>
        <DetailFooter className="flex-col items-stretch gap-2">
          <RejectComposer
            rejectForm={rejectForm}
            pending={pending}
            rejecting={rejecting}
            onRejectingChange={onRejectingChange}
          />
        </DetailFooter>
        <FormInlineError className="border-border shrink-0 border-t px-4 pb-2">
          {error}
        </FormInlineError>
      </>
    );
  }

  if (!view.showFooterActions) return null;

  return (
    <>
      <DetailFooter
        leading={
          view.showAcceptBand ? (
            <AcceptControls
              acceptForm={acceptForm}
              linkedIds={linkedIds}
              caseEvidence={caseEvidence}
              missingJobEvidenceCount={missingJobEvidenceCount}
              evidenceLoading={evidenceLoading}
              evidenceMode={view.evidenceMode}
              showAttestation={view.showAttestation}
            />
          ) : undefined
        }
      >
        <acceptForm.Subscribe
          selector={(state) => ({
            confidence: state.values.confidence,
            evidenceIds: state.values.evidenceIds,
            attestationText: state.values.attestationText,
          })}
        >
          {({ confidence, evidenceIds, attestationText }) => {
            const gate = acceptGate(
              gatedAcceptInput({
                confidence,
                evidenceIds,
                linkedIds,
                attestationText,
                patch: proposal.patch,
                needsConfidence,
                identifierCollisions: proposal.identifierCollisions,
              })
            );

            return (
              <>
                <Button
                  type="button"
                  size="sm"
                  loading={acceptBusy}
                  disabled={!gate.canAccept}
                  onClick={() => {
                    void acceptForm.handleSubmit();
                  }}
                  className="h-7"
                  title={
                    gate.confirmedWithoutBundle
                      ? CONFIRMED_REQUIRES_EVIDENCE
                      : undefined
                  }
                >
                  {acceptBusy ? null : (
                    <CheckIcon className="size-3" data-icon="inline-start" />
                  )}
                  Accept
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    onRejectingChange(true);
                  }}
                  className="h-7"
                >
                  <XIcon className="size-3" data-icon="inline-start" />
                  Reject
                </Button>
              </>
            );
          }}
        </acceptForm.Subscribe>
      </DetailFooter>
      <FormInlineError className="border-border shrink-0 border-t px-4 pb-2">
        {error}
      </FormInlineError>
    </>
  );
}
