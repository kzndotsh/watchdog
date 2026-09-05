/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- create defaults + form hook shared with IdentifiersSection */

import { useForm } from "@tanstack/react-form";
import { LinkIcon, PencilIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  CONFIRMED_REQUIRES_EVIDENCE,
  isConfirmedBlocked,
} from "@/shared/lib/confirmed-evidence";
import {
  DataTableComposerActions,
  DataTableComposerRow,
  EditableSelectCell,
  EditableSuggestCell,
  EditableTextCell,
} from "@/shared/ui/data-table";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import {
  HANDLE_REQUIRES_PLATFORM,
  isHandleWithoutPlatform,
  PLATFORM_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
} from "@/shared/ui/identifiers/identifier-cells";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import {
  EvidencePicker,
  evidenceLabel,
} from "@/shared/ui/intake/evidence-picker";
import { Button } from "@/shared/ui/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/shared/ui/shadcn/popover";
import { TableCell } from "@/shared/ui/shadcn/table";
import { CONFIDENCE_OPTIONS } from "@/shared/ui/vocab";
import {
  confidenceTierSchema,
  identifierStatusSchema,
  identifierTypeSchema,
  normalizeIdentifierPlatform,
  validateIdentifierWrite,
  type ConfidenceTier,
  type IdentifierStatus,
  type IdentifierType,
} from "@watchdog/schemas";

export const IDENTIFIER_CREATE_DEFAULTS = {
  entityId: "",
  type: "email" as IdentifierType,
  value: "",
  platform: "",
  status: "unknown" as IdentifierStatus,
  confidence: "unverified" as ConfidenceTier,
  evidenceIds: [] as string[],
};

export type IdentifierCreateValues = typeof IDENTIFIER_CREATE_DEFAULTS;

export function identifierCreateCanSubmit(
  values: IdentifierCreateValues,
  opts?: { requireEntity?: boolean }
): boolean {
  if (
    !validateIdentifierWrite({
      type: values.type,
      value: values.value,
      platform: values.platform,
    }).ok
  ) {
    return false;
  }
  if (opts?.requireEntity && values.entityId === "") return false;
  if (isConfirmedBlocked(values.confidence, values.evidenceIds)) return false;
  return true;
}

export function useIdentifierCreateForm(
  onSubmit: (args: {
    value: IdentifierCreateValues;
    reset: () => void;
  }) => Promise<void>
) {
  return useForm({
    defaultValues: IDENTIFIER_CREATE_DEFAULTS,
    onSubmit: async ({ value, formApi }) => {
      await onSubmit({
        value,
        reset: () => {
          formApi.reset();
        },
      });
    },
  });
}

type IdentifierCreateForm = ReturnType<typeof useIdentifierCreateForm>;

function identifierWriteError(
  type: IdentifierType,
  value: string,
  platform: string
): string | undefined {
  const written = validateIdentifierWrite({ type, value, platform });
  return written.ok ? undefined : written.message;
}

interface IdentifierComposerAppendProps {
  form: IdentifierCreateForm;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSubmit: () => void;
  onCancel: () => void;
  evidenceOptions: readonly EvidenceOption[];
  entityPicker?: { entities: EntityOption[] };
}

function ComposerEvidenceField({
  form,
  evidenceOptions,
}: {
  form: IdentifierCreateForm;
  evidenceOptions: readonly EvidenceOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <TableCell>
      <form.Field
        name="evidenceIds"
        validators={{
          onChangeListenTo: ["confidence"],
          onChange: ({ value, fieldApi }) => {
            const confidence = fieldApi.form.getFieldValue("confidence");
            if (isConfirmedBlocked(confidence, value)) {
              return CONFIRMED_REQUIRES_EVIDENCE;
            }
            // oxlint-disable-next-line unicorn/no-useless-undefined -- TanStack Form: undefined = valid
            return undefined;
          },
        }}
      >
        {(field) => {
          const selected = field.state.value;
          const primary = selected[0]
            ? evidenceOptions.find((opt) => opt.id === selected[0])
            : undefined;
          let primaryLabel: string | null = null;
          if (primary) {
            primaryLabel = evidenceLabel(primary);
          } else if (selected[0]) {
            primaryLabel = "1 linked";
          }
          const overflow = selected.length - 1;

          return (
            <div
              className="flex w-full max-w-full min-w-0 items-center gap-1 overflow-hidden"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
            >
              {primaryLabel ? (
                <DetailStatusChip
                  size="sm"
                  className="max-w-full min-w-0 flex-1 justify-start overflow-hidden"
                  title={primaryLabel}
                >
                  <span className="block min-w-0 truncate">{primaryLabel}</span>
                </DetailStatusChip>
              ) : null}
              {overflow > 0 ? (
                <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                  +{overflow}
                </span>
              ) : null}
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={
                        selected.length > 0
                          ? "Edit evidence links"
                          : "Link evidence"
                      }
                      title={
                        selected.length > 0
                          ? "Edit evidence links"
                          : "Link evidence"
                      }
                      disabled={form.state.isSubmitting}
                      className={cn(
                        "shrink-0",
                        selected.length > 0
                          ? "text-muted-foreground size-6 px-0"
                          : "text-muted-foreground h-6 gap-1 px-1 text-xs font-normal"
                      )}
                    />
                  }
                >
                  {selected.length > 0 ? (
                    <PencilIcon className="size-3" aria-hidden />
                  ) : (
                    <>
                      <LinkIcon className="size-3" aria-hidden />
                      <span>Link</span>
                    </>
                  )}
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-72 gap-2 rounded-md p-2"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <PopoverHeader>
                    <PopoverTitle className="text-xs">
                      Link evidence
                    </PopoverTitle>
                  </PopoverHeader>
                  <EvidencePicker
                    options={evidenceOptions}
                    selectedIds={selected}
                    onChange={(ids) => {
                      field.handleChange(ids);
                    }}
                    layout="panel"
                  />
                  <form.Subscribe
                    selector={(state) => ({
                      confidence: state.values.confidence,
                      evidenceIds: state.values.evidenceIds,
                    })}
                  >
                    {({ confidence, evidenceIds }) =>
                      isConfirmedBlocked(confidence, evidenceIds) ? (
                        <FormInlineWarning>
                          {CONFIRMED_REQUIRES_EVIDENCE}
                        </FormInlineWarning>
                      ) : null
                    }
                  </form.Subscribe>
                </PopoverContent>
              </Popover>
            </div>
          );
        }}
      </form.Field>
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
    </TableCell>
  );
}

function ValueField({
  form,
  onKeyDown,
  autoFocus,
}: {
  form: IdentifierCreateForm;
  onKeyDown: (e: React.KeyboardEvent) => void;
  autoFocus: boolean;
}) {
  return (
    <TableCell>
      <form.Field
        name="value"
        validators={{
          onChangeListenTo: ["type", "platform"],
          onChange: ({ value, fieldApi }) =>
            identifierWriteError(
              fieldApi.form.getFieldValue("type"),
              value,
              fieldApi.form.getFieldValue("platform")
            ),
          onSubmit: ({ value, fieldApi }) =>
            identifierWriteError(
              fieldApi.form.getFieldValue("type"),
              value,
              fieldApi.form.getFieldValue("platform")
            ),
        }}
      >
        {(field) => (
          <EditableTextCell
            value={field.state.value}
            onCommit={(v) => {
              field.handleChange(v);
            }}
            placeholder="Value…"
            autoFocus={autoFocus}
            onKeyDown={onKeyDown}
            disabled={form.state.isSubmitting}
          />
        )}
      </form.Field>
    </TableCell>
  );
}

function TypeField({
  form,
  onKeyDown,
}: {
  form: IdentifierCreateForm;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <TableCell>
      <form.Field name="type">
        {(field) => (
          <EditableSelectCell
            value={field.state.value}
            options={TYPE_OPTIONS}
            onCommit={(v) => {
              field.handleChange(identifierTypeSchema.parse(v));
            }}
            disabled={form.state.isSubmitting}
            onKeyDown={onKeyDown}
            aria-label="Type"
          />
        )}
      </form.Field>
    </TableCell>
  );
}

export function IdentifierComposerAppend({
  form,
  onKeyDown,
  onSubmit,
  onCancel,
  evidenceOptions,
  entityPicker,
}: IdentifierComposerAppendProps) {
  const requireEntity = entityPicker !== undefined;

  return (
    <DataTableComposerRow>
      {entityPicker ? (
        <TableCell>
          <form.Field
            name="entityId"
            validators={{
              onSubmit: ({ value }) => (value ? undefined : "Pick an entity"),
            }}
          >
            {(field) => (
              <EntityCombobox
                entities={entityPicker.entities}
                value={field.state.value}
                onValueChange={(id) => {
                  field.handleChange(id);
                }}
                allowEmpty={false}
                emptyLabel="Entity…"
                variant="cell"
                autoFocus
                disabled={form.state.isSubmitting}
                aria-label="Entity"
                onKeyDown={onKeyDown}
              />
            )}
          </form.Field>
        </TableCell>
      ) : null}
      <ValueField
        form={form}
        onKeyDown={onKeyDown}
        autoFocus={entityPicker === undefined}
      />
      <TypeField form={form} onKeyDown={onKeyDown} />
      <TableCell>
        <form.Field name="platform">
          {(field) => (
            <EditableSuggestCell
              value={field.state.value}
              options={PLATFORM_OPTIONS}
              onCommit={(v) => {
                field.handleChange(normalizeIdentifierPlatform(v));
              }}
              placeholder="Platform"
              disabled={form.state.isSubmitting}
              onKeyDown={onKeyDown}
              aria-label="Platform"
            />
          )}
        </form.Field>
      </TableCell>
      <TableCell>
        <form.Field name="status">
          {(field) => (
            <EditableSelectCell
              value={field.state.value}
              options={STATUS_OPTIONS}
              onCommit={(v) => {
                field.handleChange(identifierStatusSchema.parse(v));
              }}
              disabled={form.state.isSubmitting}
              onKeyDown={onKeyDown}
              aria-label="Status"
            />
          )}
        </form.Field>
      </TableCell>
      <TableCell>
        <form.Field name="confidence">
          {(field) => (
            <EditableSelectCell
              value={field.state.value}
              options={CONFIDENCE_OPTIONS}
              onCommit={(v) => {
                field.handleChange(confidenceTierSchema.parse(v));
              }}
              disabled={form.state.isSubmitting}
              onKeyDown={onKeyDown}
              aria-label="Confidence"
            />
          )}
        </form.Field>
      </TableCell>
      <ComposerEvidenceField form={form} evidenceOptions={evidenceOptions} />
      <form.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          values: state.values,
        })}
      >
        {({ isSubmitting, values }) => (
          <DataTableComposerActions
            busy={isSubmitting}
            canSubmit={identifierCreateCanSubmit(values, { requireEntity })}
            onSubmit={onSubmit}
            onCancel={onCancel}
            blockedHint={
              isHandleWithoutPlatform(values.type, values.platform)
                ? HANDLE_REQUIRES_PLATFORM
                : undefined
            }
          />
        )}
      </form.Subscribe>
    </DataTableComposerRow>
  );
}
