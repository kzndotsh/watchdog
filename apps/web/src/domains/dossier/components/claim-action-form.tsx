import { useForm } from "@tanstack/react-form";

import { ClaimComposerActions } from "@/domains/dossier/components/claim-composer-actions";
import { useRetractClaim } from "@/domains/dossier/hooks/use-retract-claim";
import type { ClaimRowActionKind } from "@/domains/dossier/lib/claim-row-actions";
import type { DossierEntityScope } from "@/domains/dossier/types";
import { couldnt, errMessage } from "@/lib/utils";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { FieldMessage } from "@/shared/ui/field-message";
import type { RetractKind } from "@watchdog/schemas/shared";
import { Textarea } from "@watchdog/ui/components/textarea";

/* A Claim's contest, disprove or retract form: the reason, then the retraction of that kind. */

export type ClaimAction = ClaimRowActionKind;
export type ActionState = { claimId: string; action: ClaimAction } | null;

const ACTION_TO_KIND: Record<ClaimAction, RetractKind> = {
  contest: "contested",
  disprove: "disproved",
  retract: "retracted",
};

const ACTION_SUCCESS_LABEL: Record<ClaimAction, string> = {
  contest: "Claim contested",
  disprove: "Claim disproved",
  retract: "Claim retracted",
};

const ACTION_LABELS = {
  contest: "Contest",
  disprove: "Disprove",
  retract: "Retract",
} as const;

const ACTION_PLACEHOLDERS = {
  contest: "What is contested about this claim?",
  disprove: "What disproves this claim?",
  retract: "Why is this claim being retracted?",
} as const;

type ClaimActionFormProps = {
  scope: DossierEntityScope;
  claimId: string;
  action: ClaimAction;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
};

export function ClaimActionForm({
  scope,
  claimId,
  action,
  onCancel,
  onError,
  onSaved,
}: ClaimActionFormProps) {
  const retractMutation = useRetractClaim({
    successMessage: ACTION_SUCCESS_LABEL[action],
    onRetracted: onSaved,
  });

  const failureCopy = couldnt(ACTION_LABELS[action].toLowerCase(), "claim");
  const actionForm = useForm({
    defaultValues: { actionReason: "" },
    onSubmit: async ({ value }) => {
      const reason = value.actionReason.trim();
      if (!reason) return;
      onError(null);
      try {
        await retractMutation.mutateAsync({
          ...scope,
          claimId,
          kind: ACTION_TO_KIND[action],
          reason,
        });
      } catch (caughtError) {
        onError(errMessage(caughtError, failureCopy));
      }
    },
  });

  return (
    <ComposerShell
      density="dense"
      className="ml-6"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void actionForm.handleSubmit();
      }}
    >
      <p className="text-muted-foreground text-xs">{ACTION_LABELS[action]}</p>
      <actionForm.Field
        name="actionReason"
        validators={{
          onSubmit: ({ value }) =>
            value.trim() ? undefined : "Enter a reason",
        }}
      >
        {(field) => (
          <>
            <Textarea
              placeholder={ACTION_PLACEHOLDERS[action]}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              className="min-h-12"
              autoFocus
            />
            <FieldMessage meta={field.state.meta} />
          </>
        )}
      </actionForm.Field>
      <actionForm.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          actionReason: state.values.actionReason,
        })}
      >
        {({ isSubmitting, actionReason }) => (
          <ClaimComposerActions
            submitLabel="Confirm"
            isSubmitDisabled={isSubmitting || !actionReason.trim()}
            className="justify-end"
            onCancel={onCancel}
          />
        )}
      </actionForm.Subscribe>
    </ComposerShell>
  );
}
