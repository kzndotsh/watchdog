import { useForm } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionAddButton } from "@/domains/dossier/components/dossier-section-add-button";
import { useDossierSectionEditor } from "@/domains/dossier/hooks/use-dossier-section-editor";
import type { DossierSectionEditor } from "@/domains/dossier/hooks/use-dossier-section-editor";
import { useInvalidateEntity } from "@/domains/dossier/hooks/use-invalidate-entity";
import {
  openQuestionRowActions,
  resolvedQuestionRowActions,
} from "@/domains/dossier/lib/question-row-actions";
import type { DossierSectionProps } from "@/domains/dossier/types";
import { questionsListQuery } from "@/domains/entities/questions/queries";
import {
  createQuestionFn,
  reopenQuestionFn,
  resolveQuestionFn,
  updateQuestionFn,
  type QuestionRecord,
} from "@/domains/entities/questions/questions.functions";
import { cn, errMessage } from "@/lib/utils";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { SectionLabel } from "@/shared/ui/section-label";
import { Button } from "@/shared/ui/shadcn/button";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { TargetActionsHost } from "@/shared/ui/target-actions-host";
import { TimelineDot, TimelineSpine } from "@/shared/ui/timeline-spine";

function qIndex(i: number): string {
  return `Q${String(i + 1).padStart(2, "0")}`;
}

/** `Qnn` marker + question text — shared by open and resolved rows. */
function QuestionLine({
  label,
  text,
  textClassName,
  onEdit,
}: {
  label: string;
  text: string;
  textClassName?: string;
  onEdit?: () => void;
}) {
  const textClass = cn(
    "min-w-0 text-sm leading-snug break-words whitespace-pre-wrap",
    textClassName
  );

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-label-mono-sm text-muted-foreground shrink-0 tabular-nums">
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

interface QuestionComposerValues {
  text: string;
  resolvedNote?: string | null;
}

function QuestionComposer({
  defaultText = "",
  defaultNote = "",
  density = "default",
  includeNote = false,
  submitLabel = "Save",
  onCancel,
  onError,
  onSubmit,
}: {
  defaultText?: string;
  defaultNote?: string;
  density?: "default" | "dense";
  includeNote?: boolean;
  submitLabel?: string;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSubmit: (value: QuestionComposerValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: { text: defaultText, note: defaultNote },
    onSubmit: async ({ value }) => {
      const text = value.text.trim();
      if (!text) return;
      onError(null);
      try {
        await onSubmit({
          text,
          ...(includeNote ? { resolvedNote: value.note.trim() || null } : {}),
        });
      } catch (caughtError) {
        onError(errMessage(caughtError, "Save failed"));
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
          <Textarea
            placeholder="What do we need to find out?"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => {
              field.handleChange(e.target.value);
            }}
            className="min-h-16 resize-y text-sm"
            autoFocus
            onKeyDown={handleFieldKeyDown}
          />
        )}
      </form.Field>
      {includeNote ? (
        <form.Field name="note">
          {(field) => (
            <Textarea
              placeholder="What resolved this?"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              className="min-h-12 resize-y text-xs"
              onKeyDown={handleFieldKeyDown}
            />
          )}
        </form.Field>
      ) : null}
      <div className="flex justify-end gap-1">
        <span className="text-chip text-muted-foreground self-center">
          ⌘↵ to save
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-xs"
          onClick={onCancel}
        >
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
              className="h-6 text-xs"
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

function ResolveForm({
  caseId,
  questionId,
  onCancel,
  onError,
  onSaved,
}: {
  caseId: string;
  questionId: string;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  const resolveMutation = useMutation({
    mutationFn: async (resolvedNote: string | undefined) =>
      resolveQuestionFn({
        data: {
          caseId,
          questionId,
          resolvedNote,
        },
      }),
    onSuccess: async () => {
      await onSaved();
      toast.success("Question resolved");
    },
  });

  const resolveForm = useForm({
    defaultValues: { resolveNote: "" },
    onSubmit: async ({ value }) => {
      onError(null);
      try {
        await resolveMutation.mutateAsync(
          value.resolveNote.trim() || undefined
        );
      } catch (caughtError) {
        onError(errMessage(caughtError, "Resolve failed"));
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
            className="min-h-12 text-xs"
            autoFocus
          />
        )}
      </resolveForm.Field>
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <resolveForm.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              size="sm"
              className="h-6 text-xs"
              disabled={isSubmitting}
            >
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
  resolved,
}: {
  note: string;
  resolved?: boolean;
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground mt-1.5 border-l-2 pl-2.5 text-xs leading-relaxed",
        resolved ? "border-border/40" : "border-border/60"
      )}
    >
      {resolved ? `→ ${note}` : note}
    </p>
  );
}

function QuestionNode({
  children,
  resolved = false,
  dimmed,
}: {
  children: ReactNode;
  resolved?: boolean;
  dimmed?: boolean;
}) {
  const faded = dimmed ?? resolved;
  return (
    <div
      className={cn(
        "group relative last:mb-0",
        resolved ? "mb-2.5" : "mb-3",
        faded && "opacity-80"
      )}
    >
      <TimelineDot
        className={cn(
          "bg-background top-1.5 -left-[1.4rem] size-2.5 border-2",
          resolved ? "border-border/40" : "border-muted-foreground/55"
        )}
      />
      {children}
    </div>
  );
}

function OpenQuestionRow({
  caseId,
  label,
  question,
  editor,
  resolvingId,
  onResolvingChange,
  onSaveEdit,
  onResolved,
}: {
  caseId: string;
  label: string;
  question: QuestionRecord;
  editor: DossierSectionEditor;
  resolvingId: string | null;
  onResolvingChange: (id: string | null) => void;
  onSaveEdit: (text: string) => Promise<void>;
  onResolved: () => Promise<void>;
}) {
  const editing = editor.editId === question.id;
  const resolving = resolvingId === question.id;

  if (editing) {
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
          resolving
            ? []
            : openQuestionRowActions({
                onEdit: () => {
                  onResolvingChange(null);
                  editor.handleOpenEdit(question.id);
                },
                onResolve: () => {
                  editor.handleCloseEdit();
                  onResolvingChange(question.id);
                },
              })
        }
        label="Question actions"
        className="flex items-start justify-between gap-2"
      >
        <div className="min-w-0 flex-1">
          <QuestionLine
            label={label}
            text={question.text}
            onEdit={() => {
              onResolvingChange(null);
              editor.handleOpenEdit(question.id);
            }}
          />
          {question.resolvedNote ? (
            <QuestionNote note={question.resolvedNote} />
          ) : null}
          {resolving ? (
            <ResolveForm
              caseId={caseId}
              questionId={question.id}
              onCancel={() => {
                onResolvingChange(null);
              }}
              onError={editor.handleError}
              onSaved={onResolved}
            />
          ) : null}
        </div>
        {resolving ? null : (
          <button
            type="button"
            title="Mark resolved"
            className="text-muted-foreground hover:text-foreground mt-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => {
              editor.handleCloseEdit();
              onResolvingChange(question.id);
            }}
          >
            <CheckIcon className="size-3.5" />
          </button>
        )}
      </TargetActionsHost>
    </QuestionNode>
  );
}

function ResolvedQuestionRow({
  label,
  question,
  editor,
  onSaveEdit,
  onReopen,
}: {
  label: string;
  question: QuestionRecord;
  editor: DossierSectionEditor;
  onSaveEdit: (value: {
    text: string;
    resolvedNote: string | null;
  }) => Promise<void>;
  onReopen: () => void;
}) {
  const editing = editor.editId === question.id;

  if (editing) {
    return (
      <QuestionNode resolved dimmed={false}>
        <QuestionComposer
          key={question.id}
          defaultText={question.text}
          defaultNote={question.resolvedNote ?? ""}
          density="dense"
          includeNote
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
    <QuestionNode resolved>
      <TargetActionsHost
        actions={resolvedQuestionRowActions({
          onEdit: () => {
            editor.handleOpenEdit(question.id);
          },
          onReopen,
        })}
        label="Question actions"
        className="flex items-start justify-between gap-2"
      >
        <div className="min-w-0 flex-1">
          <QuestionLine
            label={label}
            text={question.text}
            textClassName="line-through"
            onEdit={() => {
              editor.handleOpenEdit(question.id);
            }}
          />
          {question.resolvedNote ? (
            <QuestionNote note={question.resolvedNote} resolved />
          ) : null}
        </div>
      </TargetActionsHost>
    </QuestionNode>
  );
}

export function QuestionsSection({
  caseId,
  entityId,
  entitySlug,
  emptyPresentation = "inline",
}: DossierSectionProps) {
  const invalidate = useInvalidateEntity({ caseId, entityId, entitySlug });
  const { data: rows } = useSuspenseQuery(questionsListQuery(caseId, entityId));

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const editor = useDossierSectionEditor();

  const createMutation = useMutation({
    mutationFn: async (text: string) =>
      createQuestionFn({ data: { caseId, entityId, text } }),
    onSuccess: async () => {
      editor.handleStopAdding();
      await invalidate();
      toast.success("Question added");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: {
      questionId: string;
      text: string;
      resolvedNote?: string | null;
    }) =>
      updateQuestionFn({
        data: {
          caseId,
          questionId: input.questionId,
          text: input.text,
          ...(input.resolvedNote === undefined
            ? {}
            : { resolvedNote: input.resolvedNote }),
        },
      }),
    onSuccess: async () => {
      editor.handleCloseEdit();
      await invalidate();
      toast.success("Question updated");
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (questionId: string) =>
      reopenQuestionFn({ data: { caseId, questionId } }),
    onSuccess: async () => {
      editor.handleCloseEdit();
      editor.handleError(null);
      await invalidate();
      toast.success("Question reopened");
    },
    onError: (caughtError) => {
      editor.handleError(errMessage(caughtError, "Reopen failed"));
    },
  });

  const open = rows.filter((r) => r.status === "open");
  const resolved = rows.filter((r) => r.status === "resolved");

  return (
    <DossierSection
      title="Questions"
      empty={editor.isEmpty(rows.length)}
      emptyPresentation={emptyPresentation}
      emptyItems="questions"
      emptyText="No questions — add what needs investigating."
      emptyDescription="Capture what still needs investigating."
      emptyAction={
        emptyPresentation === "panel" ? (
          <DossierSectionAddButton
            variant="panel"
            noun="question"
            onClick={() => {
              setResolvingId(null);
              editor.handleStartAdding();
            }}
          />
        ) : undefined
      }
      actions={
        <DossierSectionAddButton
          variant="ghost"
          onClick={() => {
            setResolvingId(null);
            editor.handleToggleAdding();
          }}
        />
      }
    >
      <FormInlineError>{editor.error}</FormInlineError>

      {editor.adding ? (
        <QuestionComposer
          key="create"
          onCancel={editor.handleStopAdding}
          onError={editor.handleError}
          onSubmit={async ({ text }) => {
            await createMutation.mutateAsync(text);
          }}
        />
      ) : null}

      {open.length > 0 ? (
        <TimelineSpine className="border-border/70 ml-1.5 pl-5">
          {open.map((row, i) => (
            <OpenQuestionRow
              key={row.id}
              caseId={caseId}
              label={qIndex(i)}
              question={row}
              editor={editor}
              resolvingId={resolvingId}
              onResolvingChange={setResolvingId}
              onSaveEdit={async (text) => {
                await updateMutation.mutateAsync({
                  questionId: row.id,
                  text,
                });
              }}
              onResolved={async () => {
                setResolvingId(null);
                await invalidate();
              }}
            />
          ))}
        </TimelineSpine>
      ) : null}

      {resolved.length > 0 ? (
        <div className="mt-4 flex flex-col gap-1">
          <SectionLabel as="h4" density="compact">
            Resolved
          </SectionLabel>
          <TimelineSpine
            dashed={false}
            className="border-border/30 ml-1.5 pl-5"
          >
            {resolved.map((row, i) => (
              <ResolvedQuestionRow
                key={row.id}
                label={qIndex(open.length + i)}
                question={row}
                editor={editor}
                onSaveEdit={async (value) => {
                  await updateMutation.mutateAsync({
                    questionId: row.id,
                    text: value.text,
                    resolvedNote: value.resolvedNote,
                  });
                }}
                onReopen={() => {
                  reopenMutation.mutate(row.id);
                }}
              />
            ))}
          </TimelineSpine>
        </div>
      ) : null}
    </DossierSection>
  );
}
