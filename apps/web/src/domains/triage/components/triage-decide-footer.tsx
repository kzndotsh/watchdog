import { CheckIcon, GaugeIcon, XIcon } from "lucide-react";

import type { EvidenceRecord } from "@/domains/intake/types";
import { AcceptGateMessage } from "@/domains/triage/components/accept-gate-message";
import type {
  TriageAcceptForm,
  TriageRejectForm,
} from "@/domains/triage/hooks/use-triage-detail-forms";
import {
  acceptGate,
  type AcceptGateResult,
  gatedAcceptInput,
} from "@/domains/triage/lib/accept-gate";
import {
  buildDecideHeaderView,
  type DecideEvidenceMode,
} from "@/domains/triage/lib/decide-header-view";
import { proposalPatch } from "@/domains/triage/lib/filters";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { ConfidenceSelect } from "@/shared/ui/confidence-select";
import { DetailFooter } from "@/shared/ui/detail-footer";
import {
  EvidenceCiteChips,
  EvidencePicker,
  EvidenceSlotSkeleton,
} from "@/shared/ui/intake/evidence-picker";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/timestamp";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import { patchNeedsConfidence } from "@watchdog/policy/patch-needs-confidence";
import type { ConfidenceTier } from "@watchdog/schemas";
import { FieldError } from "@watchdog/ui/components/field";
import { Kbd } from "@watchdog/ui/components/kbd";
import { Textarea } from "@watchdog/ui/components/textarea";

/** Inline shortcut hint inside a Button: inherits the button's ink. */
const BUTTON_KBD_CLASS = "-mr-0.5 ml-0.5 h-4 min-w-4";

/** The one place the footer turns form state into an accept-gate result. */
function gateForForm(
  proposal: ProposalRecord,
  linkedIds: string[],
  values: {
    confidence: ConfidenceTier;
    evidenceIds: string[];
    attestationText: string;
  }
): AcceptGateResult {
  const patch = proposalPatch(proposal);
  return acceptGate(
    gatedAcceptInput({
      ...values,
      linkedIds,
      patch,
      needsConfidence: patchNeedsConfidence(patch),
      identifierCollisions: proposal.identifierCollisions,
    })
  );
}

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
  proposal,
  linkedIds,
  caseEvidence,
  acceptForm,
}: {
  evidenceLoading: boolean;
  evidenceMode: DecideEvidenceMode;
  proposal: ProposalRecord;
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
        onChangeListenTo: ["confidence", "attestationText"],
        onChange: ({ value, fieldApi }) => {
          const gate = gateForForm(proposal, linkedIds, {
            confidence: fieldApi.form.getFieldValue("confidence"),
            evidenceIds: value,
            attestationText: fieldApi.form.getFieldValue("attestationText"),
          });
          if (gate.confirmedWithoutBundle) {
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
  proposal,
  linkedIds,
}: {
  acceptForm: TriageAcceptForm;
  proposal: ProposalRecord;
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
        const gate = gateForForm(proposal, linkedIds, {
          confidence,
          evidenceIds,
          attestationText,
        });

        return (
          <AcceptGateMessage
            confirmedWithoutBundle={gate.confirmedWithoutBundle}
            zeroEvidenceWarn={gate.zeroEvidenceWarn}
          />
        );
      }}
    </acceptForm.Subscribe>
  );
}

function AcceptControls({
  acceptForm,
  proposal,
  linkedIds,
  caseEvidence,
  missingJobEvidenceCount,
  evidenceLoading,
  evidenceMode,
  showAttestation,
}: {
  acceptForm: TriageAcceptForm;
  proposal: ProposalRecord;
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
          proposal,
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
              className="min-h-10 w-full"
            />
          )}
        </acceptForm.Field>
      ) : null}
      <AcceptWarnings
        acceptForm={acceptForm}
        proposal={proposal}
        linkedIds={linkedIds}
      />
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
            className="min-h-10"
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
        {error ? (
          <div className="border-border shrink-0 border-t px-4 pb-2">
            <FieldError>{error}</FieldError>
          </div>
        ) : null}
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
              proposal={proposal}
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
            const gate = gateForForm(proposal, linkedIds, {
              confidence,
              evidenceIds,
              attestationText,
            });

            return (
              <>
                <Button
                  type="button"
                  size="sm"
                  data-hotkey="a"
                  aria-keyshortcuts="a"
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
                  <Kbd aria-hidden className={BUTTON_KBD_CLASS}>
                    A
                  </Kbd>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-hotkey="r"
                  aria-keyshortcuts="r"
                  disabled={pending}
                  onClick={() => {
                    onRejectingChange(true);
                  }}
                  className="h-7"
                >
                  <XIcon className="size-3" data-icon="inline-start" />
                  Reject
                  <Kbd aria-hidden className={BUTTON_KBD_CLASS}>
                    R
                  </Kbd>
                </Button>
              </>
            );
          }}
        </acceptForm.Subscribe>
      </DetailFooter>
      {error ? (
        <div className="border-border shrink-0 border-t px-4 pb-2">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
    </>
  );
}
