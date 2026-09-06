import { useForm } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionAddButton } from "@/domains/dossier/components/dossier-section-add-button";
import { useDossierSectionEditor } from "@/domains/dossier/hooks/use-dossier-section-editor";
import { useInvalidateEntity } from "@/domains/dossier/hooks/use-invalidate-entity";
import { eventRowActions } from "@/domains/dossier/lib/event-row-actions";
import type { DossierSectionProps } from "@/domains/dossier/types";
import {
  createEventFn,
  deleteEventFn,
  updateEventFn,
} from "@/domains/entities/events/events.functions";
import { eventsListQuery } from "@/domains/entities/events/queries";
import { cn, errMessage } from "@/lib/utils";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { Button } from "@/shared/ui/shadcn/button";
import { Calendar } from "@/shared/ui/shadcn/calendar";
import { Input } from "@/shared/ui/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/shadcn/popover";
import { TargetActionsHost } from "@/shared/ui/target-actions-host";
import { TimelineDot, TimelineSpine } from "@/shared/ui/timeline-spine";

interface EventFormValues {
  when: string;
  what: string;
  where: string;
}

const WHEN_FORMAT = "yyyy-MM-dd";

function defaultWhen(): string {
  return format(new Date(), WHEN_FORMAT);
}

/** Parse calendar day only from strict `YYYY-MM-DD` — fuzzy when stays typed. */
function parseWhenDate(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = parse(trimmed, WHEN_FORMAT, new Date());
  return isValid(parsed) ? parsed : undefined;
}

/** Ghost input — reads as timeline metadata, not a peer field box. */
const metaInputClass =
  "h-8 border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:ring-1";

/**
 * Typeable when + calendar icon. Picking a day writes `YYYY-MM-DD`; free-text
 * fuzzy dates (`~2019`, `2019-03`) remain editable.
 */
function WhenDateField({
  value,
  onBlur,
  onChange,
  onKeyDown,
}: {
  value: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseWhenDate(value);

  return (
    <div className="flex items-center gap-0.5">
      <Input
        aria-label="When"
        placeholder="YYYY-MM-DD"
        value={value}
        onBlur={onBlur}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          metaInputClass,
          "text-muted-foreground w-36 font-mono text-sm"
        )}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Pick date"
            />
          }
        >
          <CalendarIcon />
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            onSelect={(date) => {
              if (!date) return;
              onChange(format(date, WHEN_FORMAT));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * On-spine event composer — date as mono metadata, `what` as the only hero
 * field, `where` demoted behind `@`. Shared by create + edit.
 */
function EventNodeComposer({
  defaultValues,
  submitLabel,
  onCancel,
  onError,
  onSubmit,
}: {
  defaultValues: EventFormValues;
  submitLabel: string;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSubmit: (value: EventFormValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const what = value.what.trim();
      if (!what) return;
      onError(null);
      try {
        await onSubmit({
          when: value.when.trim() || defaultWhen(),
          what,
          where: value.where.trim(),
        });
      } catch (caughtError) {
        onError(errMessage(caughtError, "Save failed"));
      }
    },
  });

  function onFieldKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <form
      className="bg-muted/20 flex flex-col gap-1 rounded-md px-2 py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name="when">
        {(field) => (
          <WhenDateField
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
            onKeyDown={onFieldKeyDown}
          />
        )}
      </form.Field>

      <form.Field
        name="what"
        validators={{
          onSubmit: ({ value }) =>
            value.trim() ? undefined : "Enter what happened",
        }}
      >
        {(field) => (
          <Input
            aria-label="What happened"
            placeholder="What happened"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => {
              field.handleChange(e.target.value);
            }}
            onKeyDown={onFieldKeyDown}
            className="focus-visible:border-input focus-visible:bg-background h-9 border-transparent bg-transparent px-1 text-base shadow-none focus-visible:ring-1"
            autoFocus
          />
        )}
      </form.Field>

      <div className="flex items-center gap-0.5">
        <span
          aria-hidden
          className="text-muted-foreground/50 w-3.5 shrink-0 text-center text-sm"
        >
          @
        </span>
        <form.Field name="where">
          {(field) => (
            <Input
              aria-label="Where (optional)"
              placeholder="Place (optional)"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onKeyDown={onFieldKeyDown}
              className={cn(
                metaInputClass,
                "text-muted-foreground min-w-0 flex-1 text-sm"
              )}
            />
          )}
        </form.Field>
      </div>

      <div className="flex justify-end gap-1 pt-0.5">
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
            what: state.values.what,
          })}
        >
          {({ isSubmitting, what }) => (
            <Button
              type="submit"
              size="sm"
              className="h-6 text-xs"
              disabled={isSubmitting || !what.trim()}
            >
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

function TimelineNode({
  children,
  provisional = false,
}: {
  children: ReactNode;
  /** Create draft — brighter open dot so it reads as “next on the spine”. */
  provisional?: boolean;
}) {
  return (
    <div className="group relative mb-3 last:mb-0">
      <TimelineDot
        className={cn(
          "top-1.5 -left-[1.3rem] size-2",
          provisional ? "bg-foreground/70 ring-muted" : "bg-muted-foreground/60"
        )}
      />
      {children}
    </div>
  );
}

function EventDisplayRow({
  when,
  what,
  where,
  onEdit,
  onDelete,
}: {
  when: string;
  what: string;
  where: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const actions = eventRowActions({ onEdit, onDelete });

  return (
    <TargetActionsHost
      actions={actions}
      label="Event actions"
      className="flex items-start justify-between gap-2"
    >
      <div className="min-w-0 flex-1">
        <time className="text-muted-foreground block font-mono text-sm">
          {when}
          {where !== null && where !== "" ? (
            <span className="text-muted-foreground/60 ml-2">@ {where}</span>
          ) : null}
        </time>
        <p className="text-foreground mt-0.5 text-base leading-snug">{what}</p>
      </div>
    </TargetActionsHost>
  );
}

export function EventsSection({
  caseId,
  entityId,
  entitySlug,
  emptyPresentation = "inline",
}: DossierSectionProps) {
  const invalidate = useInvalidateEntity({ caseId, entityId, entitySlug });
  const { data: rows } = useSuspenseQuery(eventsListQuery(caseId, entityId));

  const editor = useDossierSectionEditor();

  const createMutation = useMutation({
    mutationFn: async (value: EventFormValues) =>
      createEventFn({
        data: {
          caseId,
          entityId,
          when: value.when,
          what: value.what,
          where: value.where || undefined,
        },
      }),
    onSuccess: async () => {
      editor.handleStopAdding();
      await invalidate();
      toast.success("Event added");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { eventId: string; value: EventFormValues }) =>
      updateEventFn({
        data: {
          caseId,
          eventId: input.eventId,
          when: input.value.when,
          what: input.value.what,
          where: input.value.where || undefined,
        },
      }),
    onSuccess: async () => {
      editor.handleCloseEdit();
      await invalidate();
      toast.success("Event updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (eventId: string) =>
      deleteEventFn({ data: { caseId, eventId } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Event deleted");
    },
    onError: (e) => {
      editor.handleError(errMessage(e, "Delete failed"));
    },
  });

  const showSpine = editor.adding || rows.length > 0;

  return (
    <DossierSection
      title="Events"
      empty={editor.isEmpty(rows.length)}
      emptyPresentation={emptyPresentation}
      emptyItems="events"
      emptyText="No events yet — add a dated milestone."
      emptyDescription="Add a dated milestone for this entity."
      emptyAction={
        emptyPresentation === "panel" ? (
          <DossierSectionAddButton
            variant="panel"
            noun="event"
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

      {showSpine ? (
        <TimelineSpine className="ml-2 pl-4">
          {editor.adding ? (
            <TimelineNode provisional>
              <EventNodeComposer
                key="create"
                defaultValues={{
                  when: defaultWhen(),
                  what: "",
                  where: "",
                }}
                submitLabel="Add"
                onCancel={editor.handleStopAdding}
                onError={editor.handleError}
                onSubmit={async (value) => {
                  await createMutation.mutateAsync(value);
                }}
              />
            </TimelineNode>
          ) : null}

          {rows.map((row) => (
            <TimelineNode key={row.id}>
              {editor.editId === row.id ? (
                <EventNodeComposer
                  key={row.id}
                  defaultValues={{
                    when: row.when,
                    what: row.what,
                    where: row.where ?? "",
                  }}
                  submitLabel="Save"
                  onCancel={editor.handleCloseEdit}
                  onError={editor.handleError}
                  onSubmit={async (value) => {
                    await updateMutation.mutateAsync({
                      eventId: row.id,
                      value,
                    });
                  }}
                />
              ) : (
                <EventDisplayRow
                  when={row.when}
                  what={row.what}
                  where={row.where}
                  onEdit={() => {
                    editor.handleOpenEdit(row.id);
                  }}
                  onDelete={() => {
                    editor.handleError(null);
                    deleteMutation.mutate(row.id);
                  }}
                />
              )}
            </TimelineNode>
          ))}
        </TimelineSpine>
      ) : null}
    </DossierSection>
  );
}
