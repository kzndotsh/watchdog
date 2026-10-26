import { useForm } from "@tanstack/react-form";
import { CheckIcon } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionAddButton } from "@/domains/dossier/components/dossier-section-add-button";
import { rowHistorySlot } from "@/domains/dossier/components/row-history-slot";
import { useCreateQuestion } from "@/domains/dossier/hooks/use-create-question";
import { useDeleteQuestion } from "@/domains/dossier/hooks/use-delete-question";
import { useDossierSectionEditor } from "@/domains/dossier/hooks/use-dossier-section-editor";
import type { DossierSectionEditor } from "@/domains/dossier/hooks/use-dossier-section-editor";
import { useReopenQuestion } from "@/domains/dossier/hooks/use-reopen-question";
import { useResolveQuestion } from "@/domains/dossier/hooks/use-resolve-question";
import {
  useSectionListView,
  type SectionListView,
} from "@/domains/dossier/hooks/use-section-list-view";
import { useUpdateQuestion } from "@/domains/dossier/hooks/use-update-question";
import type { DossierQuestionsSearch } from "@/domains/dossier/lib/dossier-tabs";
import {
  openQuestionRowActions,
  resolvedQuestionRowActions,
} from "@/domains/dossier/lib/question-row-actions";
import type {
  DossierEntityScope,
  DossierSectionProps,
} from "@/domains/dossier/types";
import { questionListView } from "@/domains/entities/questions/queries";
import type { QuestionRecord } from "@/domains/entities/questions/types";
import { cn, couldnt, errMessage } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { useModKeyLabel } from "@/shared/hooks/use-mod-key-label";
import { fieldInvalid } from "@/shared/lib/field-errors";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { Eyebrow } from "@/shared/ui/eyebrow";
import { FieldMessage } from "@/shared/ui/field-message";
import { ListBody, ListToolbar } from "@/shared/ui/list";
import { Button } from "@/shared/ui/primitives/button";
import { SectionLabel } from "@/shared/ui/section-label";
import { DossierPanelSkeletonLayout } from "@/shared/ui/skeletons";
import { TargetActionsHost } from "@/shared/ui/target-actions-host";
import { TimelineDot } from "@/shared/ui/timeline-dot";
import { TimelineSpine } from "@/shared/ui/timeline-spine";
import type { questionList } from "@watchdog/schemas/graph";
import type { UnfixedSearchPatch } from "@watchdog/schemas/shared";
import { FieldError } from "@watchdog/ui/components/field";
import { Textarea } from "@watchdog/ui/components/textarea";

function qIndex(i: number): string {
  return `Q${String(i + 1).padStart(2, "0")}`;
}

type QuestionLineProps = {
  label: string;
  text: string;
  textClassName?: string;
  onEdit?: () => void;
};

/** `Qnn` marker + question text — shared by open and resolved rows. */
function QuestionLine({
  label,
  text,
  textClassName,
  onEdit,
}: QuestionLineProps) {
  const textClass = cn(
    "min-w-0 text-sm leading-snug break-words whitespace-pre-wrap",
    textClassName
  );

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xs text-muted-foreground shrink-0 font-mono tabular-nums">
        {label}
      </span>
      {onEdit ? (
        <button
          type="button"
          className={cn(
            textClass,
            "hover:text-foreground text-left transition-colors"
          )}
          onClick={onEdit}
        >
          {text}
        </button>
      ) : (
        <span className={textClass}>{text}</span>
      )}
    </div>
  );
}

type QuestionComposerValues = {
  text: string;
  resolvedNote?: string | null;
};

type QuestionComposerProps = {
  defaultText?: string;
  defaultNote?: string;
  density?: "default" | "dense";
  shouldIncludeNote?: boolean;
  submitLabel?: string;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSubmit: (value: QuestionComposerValues) => Promise<void>;
};

function QuestionComposer({
  defaultText = "",
  defaultNote = "",
  density = "default",
  shouldIncludeNote = false,
  submitLabel = "Save",
  onCancel,
  onError,
  onSubmit,
}: QuestionComposerProps) {
  const modKeyLabel = useModKeyLabel();
  const form = useForm({
    defaultValues: { text: defaultText, note: defaultNote },
    onSubmit: async ({ value }) => {
      const text = value.text.trim();
      if (!text) return;
      onError(null);
      try {
        await onSubmit({
          text,
          ...(shouldIncludeNote
            ? { resolvedNote: value.note.trim() || null }
            : {}),
        });
      } catch (caughtError) {
        onError(errMessage(caughtError, couldnt("save", "question")));
      }
    },
  });

  function handleFieldKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void form.handleSubmit();
    }
  }

  return (
    <ComposerShell
      density={density}
      as="form"
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
            value.trim() ? undefined : "Enter a question",
        }}
      >
        {(field) => (
          <>
            <Textarea
              aria-invalid={fieldInvalid(field.state.meta)}
              placeholder="What do we need to find out?"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              className="min-h-16 resize-y"
              autoFocus
              onKeyDown={handleFieldKeyDown}
            />
            <FieldMessage meta={field.state.meta} />
          </>
        )}
      </form.Field>
      {shouldIncludeNote ? (
        <form.Field name="note">
          {(field) => (
            <Textarea
              placeholder="What resolved this?"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              className="min-h-12 resize-y"
              onKeyDown={handleFieldKeyDown}
            />
          )}
        </form.Field>
      ) : null}
      <div className="flex justify-end gap-1">
        <Eyebrow className="self-center">{modKeyLabel}↵ to save</Eyebrow>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <form.Subscribe
          selector={(state) => ({
            isSubmitting: state.isSubmitting,
            text: state.values.text,
          })}
        >
          {({ isSubmitting, text }) => (
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !text.trim()}
            >
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </ComposerShell>
  );
}

type ResolveFormProps = {
  scope: DossierEntityScope;
  questionId: string;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
};

function ResolveForm({
  scope,
  questionId,
  onCancel,
  onError,
  onSaved,
}: ResolveFormProps) {
  const resolveMutation = useResolveQuestion({ onResolved: onSaved });

  const resolveForm = useForm({
    defaultValues: { resolveNote: "" },
    onSubmit: async ({ value }) => {
      onError(null);
      try {
        await resolveMutation.mutateAsync({
          ...scope,
          questionId,
          resolvedNote: value.resolveNote.trim() || undefined,
        });
      } catch (caughtError) {
        onError(errMessage(caughtError, couldnt("resolve", "question")));
      }
    },
  });

  return (
    <ComposerShell
      density="dense"
      className="mt-2"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void resolveForm.handleSubmit();
      }}
    >
      <resolveForm.Field name="resolveNote">
        {(field) => (
          <Textarea
            placeholder="What resolved this?"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => {
              field.handleChange(e.target.value);
            }}
            className="min-h-12"
            autoFocus
          />
        )}
      </resolveForm.Field>
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <resolveForm.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="sm" disabled={isSubmitting}>
              Resolve
            </Button>
          )}
        </resolveForm.Subscribe>
      </div>
    </ComposerShell>
  );
}

function QuestionNote({
  note,
  isResolved,
}: {
  note: string;
  isResolved?: boolean;
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground mt-1.5 border-l-2 pl-2.5 text-xs leading-relaxed",
        isResolved ? "border-border/40" : "border-border/60"
      )}
    >
      {isResolved ? `→ ${note}` : note}
    </p>
  );
}

type QuestionNodeProps = {
  children: ReactNode;
  isResolved?: boolean;
  isDimmed?: boolean;
};

function QuestionNode({
  children,
  isResolved = false,
  isDimmed,
}: QuestionNodeProps) {
  const faded = isDimmed ?? isResolved;
  return (
    <div
      className={cn(
        "group relative last:mb-0",
        isResolved ? "mb-2.5" : "mb-3",
        faded && "opacity-80"
      )}
    >
      <TimelineDot
        size="md"
        className={cn(
          "bg-background border-2",
          isResolved ? "border-border/40" : "border-muted-foreground/55"
        )}
      />
      {children}
    </div>
  );
}

type OpenQuestionRowProps = {
  scope: DossierEntityScope;
  label: string;
  question: QuestionRecord;
  editor: DossierSectionEditor;
  resolvingId: string | null;
  onResolvingChange: (id: string | null) => void;
  onSaveEdit: (text: string) => Promise<void>;
  onResolved: () => void;
  onDelete: () => void;
};

function OpenQuestionRow({
  scope,
  label,
  question,
  editor,
  resolvingId,
  onResolvingChange,
  onSaveEdit,
  onResolved,
  onDelete,
}: OpenQuestionRowProps) {
  const isEditing = editor.editId === question.id;
  const isResolving = resolvingId === question.id;

  if (isEditing) {
    return (
      <QuestionNode>
        <QuestionComposer
          key={question.id}
          defaultText={question.text}
          density="dense"
          onCancel={editor.handleCloseEdit}
          onError={editor.handleError}
          onSubmit={async ({ text }) => {
            await onSaveEdit(text);
          }}
        />
      </QuestionNode>
    );
  }

  return (
    <QuestionNode>
      <TargetActionsHost
        actions={
          isResolving
            ? []
            : openQuestionRowActions({
                onEdit: () => {
                  onResolvingChange(null);
                  editor.handleOpenEdit(question.id, question.version);
                },
                onDelete,
                onResolve: () => {
                  editor.handleCloseEdit();
                  onResolvingChange(question.id);
                },
              })
        }
        label="Question actions"
        className="flex items-start justify-between gap-2"
        trailing={rowHistorySlot(scope.caseId, "question", question.id)}
      >
        <div className="min-w-0 flex-1">
          <QuestionLine
            label={label}
            text={question.text}
            onEdit={() => {
              onResolvingChange(null);
              editor.handleOpenEdit(question.id, question.version);
            }}
          />
          {question.resolvedNote ? (
            <QuestionNote note={question.resolvedNote} />
          ) : null}
          {isResolving ? (
            <ResolveForm
              scope={scope}
              questionId={question.id}
              onCancel={() => {
                onResolvingChange(null);
              }}
              onError={editor.handleError}
              onSaved={onResolved}
            />
          ) : null}
        </div>
        {isResolving ? null : (
          <span className="mt-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Mark resolved"
              onClick={() => {
                editor.handleCloseEdit();
                onResolvingChange(question.id);
              }}
            >
              <CheckIcon className="size-3.5" />
            </Button>
          </span>
        )}
      </TargetActionsHost>
    </QuestionNode>
  );
}

type ResolvedQuestionRowProps = {
  caseId: string;
  label: string;
  question: QuestionRecord;
  editor: DossierSectionEditor;
  onSaveEdit: (value: {
    text: string;
    resolvedNote: string | null;
  }) => Promise<void>;
  onReopen: () => void;
  onDelete: () => void;
};

function ResolvedQuestionRow({
  caseId,
  label,
  question,
  editor,
  onSaveEdit,
  onReopen,
  onDelete,
}: ResolvedQuestionRowProps) {
  const isEditing = editor.editId === question.id;

  if (isEditing) {
    return (
      <QuestionNode isResolved isDimmed={false}>
        <QuestionComposer
          key={question.id}
          defaultText={question.text}
          defaultNote={question.resolvedNote ?? ""}
          density="dense"
          shouldIncludeNote
          onCancel={editor.handleCloseEdit}
          onError={editor.handleError}
          onSubmit={async ({ text, resolvedNote }) => {
            await onSaveEdit({ text, resolvedNote: resolvedNote ?? null });
          }}
        />
      </QuestionNode>
    );
  }

  return (
    <QuestionNode isResolved>
      <TargetActionsHost
        actions={resolvedQuestionRowActions({
          onEdit: () => {
            editor.handleOpenEdit(question.id, question.version);
          },
          onDelete,
          onReopen,
        })}
        label="Question actions"
        className="flex items-start justify-between gap-2"
        trailing={rowHistorySlot(caseId, "question", question.id)}
      >
        <div className="min-w-0 flex-1">
          <QuestionLine
            label={label}
            text={question.text}
            textClassName="line-through"
            onEdit={() => {
              editor.handleOpenEdit(question.id, question.version);
            }}
          />
          {question.resolvedNote ? (
            <QuestionNote note={question.resolvedNote} isResolved />
          ) : null}
        </div>
      </TargetActionsHost>
    </QuestionNode>
  );
}

/** The Questions tab's view in the route's URL. */
export type QuestionsSectionView = SectionListView<
  DossierQuestionsSearch,
  UnfixedSearchPatch<typeof questionList, "entityId">
>;

export type QuestionsSectionProps = DossierSectionProps & {
  /** The tab's URL view and toolbar; without it the section shows the default view. */
  view?: QuestionsSectionView;
};

const NO_SEARCH: DossierQuestionsSearch = {};

/**
 * An Entity's Questions: the Case's Question list with `entityId` fixed (ADR-0007), a page at a
 * time. The loaded rows show open first, then resolved, each in the view's order.
 */
export function QuestionsSection({
  caseId,
  entityId,
  entitySlug,
  emptyPresentation = "inline",
  view,
}: QuestionsSectionProps) {
  const scope = { caseId, entityId, entitySlug };
  const { search, onSearchChange } = useSectionListView(view, NO_SEARCH);
  const list = useList(questionListView, {
    scope: { caseId },
    fixed: { entityId },
    search,
    onSearchChange,
  });
  const display = useListDisplay("dossier-questions");

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const editor = useDossierSectionEditor();

  const createMutation = useCreateQuestion({
    onCreated: editor.handleStopAdding,
  });

  const updateMutation = useUpdateQuestion({
    onUpdated: editor.handleCloseEdit,
    onReload: editor.handleCloseEdit,
  });

  const reopenMutation = useReopenQuestion({
    onReopened: () => {
      editor.handleCloseEdit();
      editor.handleError(null);
    },
    onError: editor.handleError,
  });

  const deleteMutation = useDeleteQuestion({
    onDeleted: () => {
      editor.handleCloseEdit();
      editor.handleError(null);
      setResolvingId(null);
    },
    onError: editor.handleError,
  });

  function handleDelete(questionId: string) {
    if (editor.editId === questionId) {
      editor.handleCloseEdit();
    }
    if (resolvingId === questionId) {
      setResolvingId(null);
    }
    editor.handleError(null);
    deleteMutation.mutate({ ...scope, questionId });
  }

  const isPanel = emptyPresentation === "panel";

  function renderRows(rows: readonly QuestionRecord[]) {
    const open = rows.filter((r) => r.status === "open");
    const resolved = rows.filter((r) => r.status === "resolved");
    return (
      <>
        {open.length > 0 ? (
          <TimelineSpine className="border-border/70 ml-2 pl-4">
            {open.map((row, i) => (
              <OpenQuestionRow
                key={row.id}
                scope={scope}
                label={qIndex(i)}
                question={row}
                editor={editor}
                resolvingId={resolvingId}
                onResolvingChange={setResolvingId}
                onSaveEdit={async (text) => {
                  await updateMutation.mutateAsync({
                    ...scope,
                    questionId: row.id,
                    expectedVersion: editor.editVersion ?? row.version,
                    text,
                  });
                }}
                onResolved={() => {
                  setResolvingId(null);
                }}
                onDelete={() => {
                  handleDelete(row.id);
                }}
              />
            ))}
          </TimelineSpine>
        ) : null}

        {resolved.length > 0 ? (
          <div className={cn("flex flex-col gap-1", open.length > 0 && "mt-4")}>
            <SectionLabel as="h4" density="compact">
              Resolved
            </SectionLabel>
            <TimelineSpine
              isDashed={false}
              className="border-border/30 ml-2 pl-4"
            >
              {resolved.map((row, i) => (
                <ResolvedQuestionRow
                  caseId={caseId}
                  key={row.id}
                  label={qIndex(open.length + i)}
                  question={row}
                  editor={editor}
                  onSaveEdit={async (value) => {
                    await updateMutation.mutateAsync({
                      ...scope,
                      questionId: row.id,
                      expectedVersion: editor.editVersion ?? row.version,
                      text: value.text,
                      resolvedNote: value.resolvedNote,
                    });
                  }}
                  onReopen={() => {
                    reopenMutation.mutate({ ...scope, questionId: row.id });
                  }}
                  onDelete={() => {
                    handleDelete(row.id);
                  }}
                />
              ))}
            </TimelineSpine>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <DossierSection
      title="Questions"
      isEmpty={!isPanel && list.status === "blank" && !editor.isAdding}
      emptyPresentation={emptyPresentation}
      emptyText="No questions — add what needs investigating."
      actions={
        <DossierSectionAddButton
          variant="ghost"
          onClick={() => {
            setResolvingId(null);
            editor.handleToggleAdding();
          }}
        />
      }
      shouldFill={isPanel}
    >
      <FieldError>{editor.error}</FieldError>

      {editor.isAdding ? (
        <QuestionComposer
          key="create"
          onCancel={editor.handleStopAdding}
          onError={editor.handleError}
          onSubmit={async ({ text }) => {
            await createMutation.mutateAsync({ ...scope, text });
          }}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {view === undefined ? null : (
          <ListToolbar list={list} display={display} />
        )}
        <ListBody
          list={list}
          skeleton={
            isPanel ? <DossierPanelSkeletonLayout variant="list" /> : null
          }
          blankSlateAction={
            <DossierSectionAddButton
              variant="panel"
              noun="question"
              onClick={() => {
                setResolvingId(null);
                editor.handleStartAdding();
              }}
            />
          }
        >
          {renderRows}
        </ListBody>
      </div>
    </DossierSection>
  );
}
