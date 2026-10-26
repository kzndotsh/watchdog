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
import { hotkeyAttrs, hotkeyDef } from "@/shared/lib/hotkeys";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { ConfidenceSelect } from "@/shared/ui/confidence-select";
import { DetailFooter } from "@/shared/ui/detail-footer";
import { EvidenceCiteChips } from "@/shared/ui/intake/evidence-cite-chips";
import { EvidenceSlotSkeleton } from "@/shared/ui/intake/evidence-slot-skeleton";
import { ListedEvidencePicker } from "@/shared/ui/intake/listed-evidence-picker";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import { patchNeedsConfidence } from "@watchdog/policy/patch-needs-confidence";
import type { ConfidenceTier } from "@watchdog/schemas/shared";
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
      isConfidenceNeeded: patchNeedsConfidence(patch),
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
  isEvidenceLoading,
  evidenceMode,
  proposal,
  linkedIds,
  caseEvidence,
  acceptForm,
}: {
  isEvidenceLoading: boolean;
  evidenceMode: DecideEvidenceMode;
  proposal: ProposalRecord;
  linkedIds: string[];
  caseEvidence: EvidenceRecord[];
  acceptForm: TriageAcceptForm;
}) {
  if (isEvidenceLoading) {
    return (
      <EvidenceSlotSkeleton mode={evidenceMode} citeCount={linkedIds.length} />
    );
  }
  if (evidenceMode === "cite") {
    return <EvidenceCiteChips hasIcon options={caseEvidence} ids={linkedIds} />;
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
          if (gate.isConfirmedWithoutBundle) {
            return CONFIRMED_REQUIRES_EVIDENCE;
          }
          // oxlint-disable-next-line unicorn/no-useless-undefined -- TanStack Form: undefined = valid
          return undefined;
        },
      }}
    >
      {(field) => (
        <ListedEvidencePicker
          shouldDashWhenEmpty
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

type AcceptWarningsProps = {
  acceptForm: TriageAcceptForm;
  proposal: ProposalRecord;
  linkedIds: string[];
};

function AcceptWarnings({
  acceptForm,
  proposal,
  linkedIds,
}: AcceptWarningsProps) {
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
            isConfirmedWithoutBundle={gate.isConfirmedWithoutBundle}
            shouldWarnZeroEvidence={gate.shouldWarnZeroEvidence}
          />
        );
      }}
    </acceptForm.Subscribe>
  );
}

type AcceptControlsProps = {
  acceptForm: TriageAcceptForm;
  proposal: ProposalRecord;
  linkedIds: string[];
  caseEvidence: EvidenceRecord[];
  missingJobEvidenceCount: number;
  isEvidenceLoading: boolean;
  evidenceMode: DecideEvidenceMode;
  shouldShowAttestation: boolean;
};

function AcceptControls({
  acceptForm,
  proposal,
  linkedIds,
  caseEvidence,
  missingJobEvidenceCount,
  isEvidenceLoading,
  evidenceMode,
  shouldShowAttestation,
}: AcceptControlsProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <WithTooltip
            content="Confidence"
            shouldWrapSpan
            className="inline-flex"
          >
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
          isEvidenceLoading,
          evidenceMode,
          proposal,
          linkedIds,
          caseEvidence,
          acceptForm,
        })}
      </div>
      <JobEvidenceMissingHint missingCount={missingJobEvidenceCount} />
      {shouldShowAttestation ? (
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

type RejectComposerProps = {
  rejectForm: TriageRejectForm;
  isPending: boolean;
  isRejecting: boolean;
  onRejectingChange: (rejecting: boolean) => void;
};

function RejectComposer({
  rejectForm,
  isPending,
  isRejecting,
  onRejectingChange,
}: RejectComposerProps) {
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
          disabled={isPending}
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
          loading={isPending && isRejecting}
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

type TriageDecideFooterProps = {
  proposal: ProposalRecord;
  acceptForm: TriageAcceptForm;
  rejectForm: TriageRejectForm;
  linkedIds: string[];
  caseEvidence: EvidenceRecord[];
  missingJobEvidenceCount: number;
  isEvidenceLoading: boolean;
  isPending: boolean;
  error: string | null;
  isRejecting: boolean;
  onRejectingChange: (rejecting: boolean) => void;
};

export function TriageDecideFooter({
  proposal,
  acceptForm,
  rejectForm,
  linkedIds,
  caseEvidence,
  missingJobEvidenceCount,
  isEvidenceLoading,
  isPending,
  error,
  isRejecting,
  onRejectingChange,
}: TriageDecideFooterProps) {
  const view = buildDecideHeaderView({
    proposal,
    linkedIds,
    isRejecting,
  });
  const acceptBusy = isPending && view.decideMode === "accepting";

  if (view.shouldShowRejectComposer) {
    return (
      <>
        <DetailFooter className="flex-col items-stretch gap-2">
          <RejectComposer
            rejectForm={rejectForm}
            isPending={isPending}
            isRejecting={isRejecting}
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

  if (!view.shouldShowFooterActions) return null;

  return (
    <>
      <DetailFooter
        leading={
          view.shouldShowAcceptBand ? (
            <AcceptControls
              acceptForm={acceptForm}
              proposal={proposal}
              linkedIds={linkedIds}
              caseEvidence={caseEvidence}
              missingJobEvidenceCount={missingJobEvidenceCount}
              isEvidenceLoading={isEvidenceLoading}
              evidenceMode={view.evidenceMode}
              shouldShowAttestation={view.shouldShowAttestation}
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
                  {...hotkeyAttrs("triage-accept")}
                  loading={acceptBusy}
                  disabled={!gate.canAccept}
                  onClick={() => {
                    void acceptForm.handleSubmit();
                  }}
                  title={
                    gate.isConfirmedWithoutBundle
                      ? CONFIRMED_REQUIRES_EVIDENCE
                      : undefined
                  }
                >
                  {acceptBusy ? null : (
                    <CheckIcon className="size-3" data-icon="inline-start" />
                  )}
                  Accept
                  <Kbd aria-hidden className={BUTTON_KBD_CLASS}>
                    {hotkeyDef("triage-accept").chord}
                  </Kbd>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  {...hotkeyAttrs("triage-reject")}
                  disabled={isPending}
                  onClick={() => {
                    onRejectingChange(true);
                  }}
                >
                  <XIcon className="size-3" data-icon="inline-start" />
                  Reject
                  <Kbd aria-hidden className={BUTTON_KBD_CLASS}>
                    {hotkeyDef("triage-reject").chord}
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
