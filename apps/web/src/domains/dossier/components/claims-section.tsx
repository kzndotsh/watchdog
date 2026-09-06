import { useForm } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode, type SubmitEvent } from "react";
import { toast } from "sonner";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionAddButton } from "@/domains/dossier/components/dossier-section-add-button";
import { EvidencePicker } from "@/domains/dossier/components/evidence-picker";
import { ClaimClassSelect } from "@/domains/dossier/components/graph-field-selects";
import { useDossierSectionEditor } from "@/domains/dossier/hooks/use-dossier-section-editor";
import { useInvalidateEntity } from "@/domains/dossier/hooks/use-invalidate-entity";
import {
  claimDefaultsFromRow,
  claimEvidenceIdsValidator,
  claimFormOptions,
  type ClaimFormValues,
} from "@/domains/dossier/lib/claim-form";
import {
  claimRowActions,
  type ClaimRowActionKind,
} from "@/domains/dossier/lib/claim-row-actions";
import {
  CONFIRMED_REQUIRES_EVIDENCE,
  CONFIRMED_REQUIRES_EVIDENCE_HINT,
  isConfirmedBlocked,
} from "@/domains/dossier/lib/confirmed-evidence";
import type { DossierSectionWithEvidenceProps } from "@/domains/dossier/types";
import {
  createClaimFn,
  retractClaimFn,
  updateClaimFn,
  type ClaimRecord,
} from "@/domains/entities/claims/claims.functions";
import { claimsListQuery } from "@/domains/entities/claims/queries";
import { cn, errMessage } from "@/lib/utils";
import { ClickableIdChip } from "@/shared/ui/clickable-id-chip";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { ConfidenceSelect } from "@/shared/ui/confidence-select";
import {
  FormInlineError,
  FormInlineWarning,
} from "@/shared/ui/form-inline-message";
import { Button } from "@/shared/ui/shadcn/button";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { TargetActionsHost } from "@/shared/ui/target-actions-host";
import { ClaimClassBadge, ConfidenceBadge } from "@/shared/ui/vocab";
import type { RetractKind } from "@watchdog/schemas";

type ClaimAction = ClaimRowActionKind;
type ActionState = { claimId: string; action: ClaimAction } | null;

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

/** Create uses the bordered composer surface; row edit renders in place. */
type ClaimComposerShell = "composer" | "inline";

interface ClaimComposerLayout {
  textareaClass: string;
  /** Composer packs actions into the field row; inline edit gets its own footer row. */
  actionsInFieldRow: boolean;
  actionsClass: string;
}

function claimComposerLayout(shell: ClaimComposerShell): ClaimComposerLayout {
  switch (shell) {
    case "composer": {
      return {
        textareaClass: "min-h-16 resize-y text-sm",
        actionsInFieldRow: true,
        actionsClass: "ml-auto",
      };
    }
    case "inline": {
      return {
        textareaClass:
          "min-h-20 w-full resize-y text-sm break-words whitespace-pre-wrap",
        actionsInFieldRow: false,
        actionsClass: "justify-end",
      };
    }
    default: {
      const _exhaustive: never = shell;
      return _exhaustive;
    }
  }
}

function ClaimComposerFrame({
  shell,
  children,
  onSubmit,
}: {
  shell: ClaimComposerShell;
  children: ReactNode;
  onSubmit: (e: SubmitEvent) => void;
}) {
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

/** Shared Cancel + submit footer for every claim form (composer, row edit, action). */
function ClaimComposerActions({
  submitLabel,
  submitDisabled,
  submitTitle,
  className,
  onCancel,
}: {
  submitLabel: string;
  submitDisabled: boolean;
  submitTitle?: string;
  className?: string;
  onCancel: () => void;
}) {
  return (
    <div className={cn("flex gap-1", className)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 text-xs"
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        size="sm"
        className="h-6 text-xs"
        disabled={submitDisabled}
        title={submitTitle}
      >
        {submitLabel}
      </Button>
    </div>
  );
}

function ClaimComposer({
  defaultValues,
  evidenceOptions,
  shell,
  submitLabel,
  textPlaceholder,
  onCancel,
  onError,
  onSubmit,
}: {
  defaultValues: ClaimFormValues;
  evidenceOptions: DossierSectionWithEvidenceProps["evidenceOptions"];
  shell: ClaimComposerShell;
  submitLabel: string;
  textPlaceholder?: string;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSubmit: (value: ClaimFormValues) => Promise<void>;
}) {
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
        onError(errMessage(caughtError, "Save failed"));
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
            submitDisabled={isSubmitting || !text.trim() || confirmedBlocked}
            submitTitle={
              confirmedBlocked ? CONFIRMED_REQUIRES_EVIDENCE_HINT : undefined
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
            <EvidencePicker
              options={evidenceOptions}
              selectedIds={field.state.value}
              onChange={(ids) => {
                field.handleChange(ids);
              }}
            />
          )}
        </form.Field>
        {layout.actionsInFieldRow ? actions : null}
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
      {layout.actionsInFieldRow ? null : actions}
    </ClaimComposerFrame>
  );
}

function ClaimActionForm({
  caseId,
  claimId,
  action,
  onCancel,
  onError,
  onSaved,
}: {
  caseId: string;
  claimId: string;
  action: ClaimAction;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  const retractMutation = useMutation({
    mutationFn: async (reason: string) =>
      retractClaimFn({
        data: {
          caseId,
          claimId,
          kind: ACTION_TO_KIND[action],
          reason,
        },
      }),
    onSuccess: async () => {
      await onSaved();
      toast.success(ACTION_SUCCESS_LABEL[action]);
    },
  });

  const actionForm = useForm({
    defaultValues: { actionReason: "" },
    onSubmit: async ({ value }) => {
      const reason = value.actionReason.trim();
      if (!reason) return;
      onError(null);
      try {
        await retractMutation.mutateAsync(reason);
      } catch (caughtError) {
        onError(errMessage(caughtError, `${action} failed`));
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
      <p className="text-muted-foreground text-xs font-medium">
        {ACTION_LABELS[action]}
      </p>
      <actionForm.Field
        name="actionReason"
        validators={{
          onSubmit: ({ value }) =>
            value.trim() ? undefined : "Enter a reason",
        }}
      >
        {(field) => (
          <Textarea
            placeholder={ACTION_PLACEHOLDERS[action]}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => {
              field.handleChange(e.target.value);
            }}
            className="min-h-12 text-xs"
            autoFocus
          />
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
            submitDisabled={isSubmitting || !actionReason.trim()}
            className="justify-end"
            onCancel={onCancel}
          />
        )}
      </actionForm.Subscribe>
    </ComposerShell>
  );
}

export function ClaimsSection({
  caseId,
  entityId,
  entitySlug,
  evidenceOptions,
  onEvidenceClick,
  emptyPresentation = "inline",
}: DossierSectionWithEvidenceProps) {
  const invalidate = useInvalidateEntity({ caseId, entityId, entitySlug });
  const { data: claimsRaw } = useSuspenseQuery(
    claimsListQuery(caseId, entityId)
  );
  const rows = useMemo(
    () => claimsRaw.filter((c) => !c.retracted),
    [claimsRaw]
  );

  const [actionState, setActionState] = useState<ActionState>(null);
  const editor = useDossierSectionEditor();

  const createMutation = useMutation({
    mutationFn: async (value: ClaimFormValues) =>
      createClaimFn({
        data: {
          caseId,
          entityId,
          text: value.text,
          class: value.claimClass,
          confidence: value.confidence,
          evidenceIds: value.evidenceIds,
        },
      }),
    onSuccess: async () => {
      editor.handleStopAdding();
      await invalidate();
      toast.success("Claim saved");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { claimId: string; value: ClaimFormValues }) =>
      updateClaimFn({
        data: {
          caseId,
          claimId: input.claimId,
          text: input.value.text,
          class: input.value.claimClass,
          confidence: input.value.confidence,
          evidenceIds: input.value.evidenceIds,
        },
      }),
    onSuccess: async () => {
      editor.handleCloseEdit();
      await invalidate();
      toast.success("Claim updated");
    },
  });

  function openAction(claimId: string, action: ClaimAction) {
    setActionState({ claimId, action });
    editor.handleCloseEdit();
  }

  function openEdit(row: ClaimRecord) {
    setActionState(null);
    editor.handleOpenEdit(row.id);
  }

  return (
    <DossierSection
      title="Claims"
      empty={editor.isEmpty(rows.length)}
      emptyPresentation={emptyPresentation}
      emptyItems="claims"
      emptyText="No claims yet — add one or run a Capability."
      emptyDescription="Add a claim here, or run a Capability that proposes claims."
      emptyAction={
        emptyPresentation === "panel" ? (
          <DossierSectionAddButton
            variant="panel"
            noun="claim"
            onClick={editor.handleStartAdding}
          />
        ) : undefined
      }
      actions={
        <DossierSectionAddButton
          variant="ghost"
          onClick={editor.handleToggleAdding}
        />
      }
    >
      <FormInlineError>{editor.error}</FormInlineError>

      {editor.adding ? (
        <ClaimComposer
          key="create"
          defaultValues={claimFormOptions.defaultValues}
          evidenceOptions={evidenceOptions}
          shell="composer"
          submitLabel="Save"
          textPlaceholder="Claim text"
          onCancel={editor.handleStopAdding}
          onError={editor.handleError}
          onSubmit={async (value) => {
            await createMutation.mutateAsync(value);
          }}
        />
      ) : null}

      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const actions = claimRowActions(row, {
            onEdit: openEdit,
            onAction: openAction,
          });
          return (
            <li key={row.id} className="group flex flex-col gap-1.5">
              <TargetActionsHost
                actions={editor.editId === row.id ? [] : actions}
                label="Claim actions"
                className="flex items-start gap-2 text-sm"
              >
                <span className="text-muted-foreground w-4 shrink-0 pt-0.5 text-xs tabular-nums">
                  {i + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  {editor.editId === row.id ? (
                    <ClaimComposer
                      key={row.id}
                      defaultValues={claimDefaultsFromRow(row)}
                      evidenceOptions={evidenceOptions}
                      shell="inline"
                      submitLabel="Save"
                      onCancel={editor.handleCloseEdit}
                      onError={editor.handleError}
                      onSubmit={async (value) => {
                        await updateMutation.mutateAsync({
                          claimId: row.id,
                          value,
                        });
                      }}
                    />
                  ) : (
                    <p className="leading-snug break-words whitespace-pre-wrap">
                      {row.text}
                    </p>
                  )}
                  <div className="text-label-sm mt-1 flex flex-wrap items-center gap-1.5">
                    <ClaimClassBadge claimClass={row.class} />
                    <ConfidenceBadge confidence={row.confidence} />
                    {row.evidenceIds.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {row.evidenceIds.map((id) => (
                          <ClickableIdChip
                            key={id}
                            value={id}
                            onClick={onEvidenceClick}
                          />
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>
              </TargetActionsHost>

              {actionState?.claimId === row.id ? (
                <ClaimActionForm
                  key={`${row.id}-${actionState.action}`}
                  caseId={caseId}
                  claimId={row.id}
                  action={actionState.action}
                  onCancel={() => {
                    setActionState(null);
                  }}
                  onError={editor.handleError}
                  onSaved={async () => {
                    setActionState(null);
                    await invalidate();
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </DossierSection>
  );
}
