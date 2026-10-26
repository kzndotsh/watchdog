import { useForm } from "@tanstack/react-form";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionAddButton } from "@/domains/dossier/components/dossier-section-add-button";
import { RowHistory } from "@/domains/dossier/components/row-history";
import { useCreateEvent } from "@/domains/dossier/hooks/use-create-event";
import { useDeleteEvent } from "@/domains/dossier/hooks/use-delete-event";
import { useDossierSectionEditor } from "@/domains/dossier/hooks/use-dossier-section-editor";
import {
  useSectionListView,
  type SectionListView,
} from "@/domains/dossier/hooks/use-section-list-view";
import { useUpdateEvent } from "@/domains/dossier/hooks/use-update-event";
import type { DossierEventsSearch } from "@/domains/dossier/lib/dossier-tabs";
import { eventRowActions } from "@/domains/dossier/lib/event-row-actions";
import type { DossierSectionProps } from "@/domains/dossier/types";
import { eventListView } from "@/domains/entities/events/queries";
import { cn, couldnt, errMessage } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { fieldInvalid } from "@/shared/lib/field-errors";
import { FieldMessage } from "@/shared/ui/field-message";
import { ListBody, ListToolbar } from "@/shared/ui/list";
import { Button } from "@/shared/ui/primitives/button";
import { DossierPanelSkeletonLayout } from "@/shared/ui/skeletons";
import { TargetActionsHost } from "@/shared/ui/target-actions-host";
import { TimelineDot } from "@/shared/ui/timeline-dot";
import { TimelineSpine } from "@/shared/ui/timeline-spine";
import type { eventList } from "@watchdog/schemas/graph";
import type { UnfixedSearchPatch } from "@watchdog/schemas/shared";
import { Calendar } from "@watchdog/ui/components/calendar";
import { FieldError } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

type EventFormValues = {
  when: string;
  what: string;
  where: string;
};

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

type WhenDateFieldProps = {
  value: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * Typeable when + calendar icon. Picking a day writes `YYYY-MM-DD`; free-text
 * fuzzy dates (`~2019`, `2019-03`) remain editable.
 */
function WhenDateField({
  value,
  onBlur,
  onChange,
  onKeyDown,
}: WhenDateFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
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
        className="h-8 w-36 font-mono"
      />
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Pick date"
            />
          }
        >
          <CalendarIcon />
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            onSelect={(date) => {
              if (!date) return;
              onChange(format(date, WHEN_FORMAT));
              setIsOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

type EventNodeComposerProps = {
  defaultValues: EventFormValues;
  submitLabel: string;
  onCancel: () => void;
  onError: (message: string | null) => void;
  onSubmit: (value: EventFormValues) => Promise<void>;
};

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
}: EventNodeComposerProps) {
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
        onError(errMessage(caughtError, couldnt("save", "event")));
      }
    },
  });

  function handleFieldKeyDown(e: KeyboardEvent<HTMLInputElement>) {
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
            onKeyDown={handleFieldKeyDown}
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
          <>
            <Input
              aria-invalid={fieldInvalid(field.state.meta)}
              aria-label="What happened"
              placeholder="What happened"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onKeyDown={handleFieldKeyDown}
              autoFocus
            />
            <FieldMessage meta={field.state.meta} />
          </>
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
              onKeyDown={handleFieldKeyDown}
              className="h-8 min-w-0 flex-1"
            />
          )}
        </form.Field>
      </div>

      <div className="flex justify-end gap-1 pt-0.5">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
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
  isProvisional = false,
}: {
  children: ReactNode;
  /** Create draft — brighter open dot so it reads as “next on the spine”. */
  isProvisional?: boolean;
}) {
  return (
    <div className="group relative mb-3 last:mb-0">
      <TimelineDot
        className={cn(
          isProvisional
            ? "bg-foreground/70 ring-muted"
            : "bg-muted-foreground/60"
        )}
      />
      {children}
    </div>
  );
}

type EventDisplayRowProps = {
  caseId: string;
  eventId: string;
  when: string;
  what: string;
  where: string | null;
  onEdit: () => void;
  onDelete: () => void;
};

function EventDisplayRow({
  caseId,
  eventId,
  when,
  what,
  where,
  onEdit,
  onDelete,
}: EventDisplayRowProps) {
  const actions = eventRowActions({ onEdit, onDelete });

  return (
    <TargetActionsHost
      actions={actions}
      label="Event actions"
      className="flex items-start justify-between gap-2"
      trailing={<RowHistory caseId={caseId} kind="event" rowId={eventId} />}
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

/** The Events tab's view in the route's URL. */
export type EventsSectionView = SectionListView<
  DossierEventsSearch,
  UnfixedSearchPatch<typeof eventList, "entityId">
>;

export type EventsSectionProps = DossierSectionProps & {
  /** The tab's URL view and toolbar; without it the section shows the default view. */
  view?: EventsSectionView;
};

const NO_SEARCH: DossierEventsSearch = {};

/**
 * An Entity's timeline: the Case's Event list with `entityId` fixed (ADR-0007), a page at a time,
 * in `when` order unless the view sorts it otherwise.
 */
export function EventsSection({
  caseId,
  entityId,
  entitySlug,
  emptyPresentation = "inline",
  view,
}: EventsSectionProps) {
  const scope = { caseId, entityId, entitySlug };
  const { search, onSearchChange } = useSectionListView(view, NO_SEARCH);
  const list = useList(eventListView, {
    scope: { caseId },
    fixed: { entityId },
    search,
    onSearchChange,
  });
  const display = useListDisplay("dossier-events");

  const editor = useDossierSectionEditor();

  const createMutation = useCreateEvent({
    onCreated: editor.handleStopAdding,
  });

  const updateMutation = useUpdateEvent({
    onUpdated: editor.handleCloseEdit,
    onReload: editor.handleCloseEdit,
  });

  const deleteMutation = useDeleteEvent({ onError: editor.handleError });

  const isPanel = emptyPresentation === "panel";
  const composer = editor.isAdding ? (
    <TimelineNode isProvisional>
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
          await createMutation.mutateAsync({ ...scope, value });
        }}
      />
    </TimelineNode>
  ) : null;

  return (
    <DossierSection
      title="Events"
      isEmpty={!isPanel && list.status === "blank" && !editor.isAdding}
      emptyPresentation={emptyPresentation}
      emptyText="No events yet — add a dated milestone."
      actions={
        <DossierSectionAddButton
          variant="ghost"
          onClick={editor.handleToggleAdding}
        />
      }
      shouldFill={isPanel}
    >
      <FieldError>{editor.error}</FieldError>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {view === undefined ? null : (
          <ListToolbar list={list} display={display} />
        )}
        {list.status === "ready" || composer === null ? null : (
          <TimelineSpine className="ml-2 pl-4">{composer}</TimelineSpine>
        )}
        <ListBody
          list={list}
          skeleton={
            isPanel ? <DossierPanelSkeletonLayout variant="timeline" /> : null
          }
          blankSlateAction={
            <DossierSectionAddButton
              variant="panel"
              onClick={editor.handleStartAdding}
            />
          }
        >
          {(rows) => (
            <TimelineSpine className="ml-2 pl-4">
              {composer}
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
                          ...scope,
                          eventId: row.id,
                          expectedVersion: editor.editVersion ?? row.version,
                          value,
                        });
                      }}
                    />
                  ) : (
                    <EventDisplayRow
                      caseId={caseId}
                      eventId={row.id}
                      when={row.when}
                      what={row.what}
                      where={row.where}
                      onEdit={() => {
                        editor.handleOpenEdit(row.id, row.version);
                      }}
                      onDelete={() => {
                        editor.handleError(null);
                        deleteMutation.mutate({ ...scope, eventId: row.id });
                      }}
                    />
                  )}
                </TimelineNode>
              ))}
            </TimelineSpine>
          )}
        </ListBody>
      </div>
    </DossierSection>
  );
}
