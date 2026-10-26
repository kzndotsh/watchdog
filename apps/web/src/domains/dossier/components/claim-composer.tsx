import { useForm } from "@tanstack/react-form";
import type { ReactNode, SubmitEvent } from "react";

import { ClaimComposerActions } from "@/domains/dossier/components/claim-composer-actions";
import { ClaimClassSelect } from "@/domains/dossier/components/graph-field-selects";
import {
  claimEvidenceIdsValidator,
  claimFormOptions,
  type ClaimFormValues,
} from "@/domains/dossier/lib/claim-form";
import { couldnt, errMessage } from "@/lib/utils";
import type { PickerPort } from "@/shared/hooks/use-picker-source";
import { isConfirmedBlocked } from "@/shared/lib/confirmed-evidence";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { ConfidenceSelect } from "@/shared/ui/confidence-select";
import { FieldMessage } from "@/shared/ui/field-message";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { SearchedEvidencePicker } from "@/shared/ui/intake/searched-evidence-picker";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import { Textarea } from "@watchdog/ui/components/textarea";

/* The Dossier's Claim composer: create (bordered composer) and a row's inline edit. */

/** Create uses the bordered composer surface; row edit renders in place. */
type ClaimComposerShell = "composer" | "inline";

type ClaimComposerLayout = {
  textareaClass: string;
  /** Composer packs actions into the field row; inline edit gets its own footer row. */
  hasActionsInFieldRow: boolean;
  actionsClass: string;
};

function claimComposerLayout(shell: ClaimComposerShell): ClaimComposerLayout {
  switch (shell) {
    case "composer": {
      return {
        textareaClass: "min-h-16 resize-y text-sm",
        hasActionsInFieldRow: true,
        actionsClass: "ml-auto",
      };
    }
    case "inline": {
      return {
        textareaClass:
          "min-h-20 w-full resize-y text-sm break-words whitespace-pre-wrap",
        hasActionsInFieldRow: false,
        actionsClass: "justify-end",
      };
    }
    default: {
      const _exhaustive: never = shell;
      return _exhaustive;
    }
  }
}

type ClaimComposerFrameProps = {
  shell: ClaimComposerShell;
  children: ReactNode;
  onSubmit: (e: SubmitEvent) => void;
};

function ClaimComposerFrame({
  shell,
  children,
  onSubmit,
}: ClaimComposerFrameProps) {
  switch (shell) {
    case "composer": {
      return (
        <ComposerShell as="form" onSubmit={onSubmit}>
          {children}
        </ComposerShell>
      );
    }
    case "inline": {
      return (
        <form className="flex min-w-0 flex-col gap-1.5" onSubmit={onSubmit}>
          {children}
        </form>
      );
    }
    default: {
      const _exhaustive: never = shell;
      return _exhaustive;
    }
  }
}

type ClaimComposerProps = {
  defaultValues: ClaimFormValues;
  /** The Case's Evidence picker reads (`evidencePickerPort(caseId)`). */
  evidencePort: PickerPort<EvidenceOption>;
  shell: ClaimComposerShell;
  submitLabel: string;
  textPlaceholder?: string;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSubmit: (value: ClaimFormValues) => Promise<void>;
};

export function ClaimComposer({
  defaultValues,
  evidencePort,
  shell,
  submitLabel,
  textPlaceholder,
  onCancel,
  onError,
  onSubmit,
}: ClaimComposerProps) {
  const form = useForm({
    ...claimFormOptions,
    defaultValues,
    onSubmit: async ({ value }) => {
      const text = value.text.trim();
      if (!text || isConfirmedBlocked(value.confidence, value.evidenceIds)) {
        return;
      }
      onError(null);
      try {
        await onSubmit({
          ...value,
          text,
        });
      } catch (caughtError) {
        onError(errMessage(caughtError, couldnt("save", "claim")));
      }
    },
  });

  const layout = claimComposerLayout(shell);

  const actions = (
    <form.Subscribe
      selector={(state) => ({
        isSubmitting: state.isSubmitting,
        text: state.values.text,
        confidence: state.values.confidence,
        evidenceIds: state.values.evidenceIds,
      })}
    >
      {({ isSubmitting, text, confidence, evidenceIds }) => {
        const confirmedBlocked = isConfirmedBlocked(confidence, evidenceIds);
        return (
          <ClaimComposerActions
            submitLabel={submitLabel}
            isSubmitDisabled={isSubmitting || !text.trim() || confirmedBlocked}
            submitTitle={
              confirmedBlocked ? CONFIRMED_REQUIRES_EVIDENCE : undefined
            }
            className={layout.actionsClass}
            onCancel={onCancel}
          />
        );
      }}
    </form.Subscribe>
  );

  return (
    <ClaimComposerFrame
      shell={shell}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="text"
        validators={{
          onSubmit: ({ value }) =>
            value.trim() ? undefined : "Enter claim text",
        }}
      >
        {(field) => (
          <>
            <Textarea
              placeholder={textPlaceholder}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancel();
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void form.handleSubmit();
                }
              }}
              className={layout.textareaClass}
              autoFocus
            />
            <FieldMessage meta={field.state.meta} />
          </>
        )}
      </form.Field>
      <div className="flex flex-wrap items-center gap-2">
        <form.Field name="claimClass">
          {(field) => (
            <ClaimClassSelect
              value={field.state.value}
              onChange={(next) => {
                field.handleChange(next);
              }}
            />
          )}
        </form.Field>
        <form.Field name="confidence">
          {(field) => (
            <ConfidenceSelect
              value={field.state.value}
              onChange={(next) => {
                field.handleChange(next);
              }}
            />
          )}
        </form.Field>
        <form.Field
          name="evidenceIds"
          validators={{
            onChangeListenTo: ["confidence"],
            onChange: claimEvidenceIdsValidator,
          }}
        >
          {(field) => (
            <SearchedEvidencePicker
              port={evidencePort}
              selectedIds={field.state.value}
              onChange={(ids) => {
                field.handleChange(ids);
              }}
            />
          )}
        </form.Field>
        {layout.hasActionsInFieldRow ? actions : null}
      </div>
      <form.Subscribe
        selector={(state) => ({
          confidence: state.values.confidence,
          evidenceIds: state.values.evidenceIds,
        })}
      >
        {({ confidence, evidenceIds }) =>
          isConfirmedBlocked(confidence, evidenceIds) ? (
            <FormInlineWarning>{CONFIRMED_REQUIRES_EVIDENCE}</FormInlineWarning>
          ) : null
        }
      </form.Subscribe>
      {layout.hasActionsInFieldRow ? null : actions}
    </ClaimComposerFrame>
  );
}
