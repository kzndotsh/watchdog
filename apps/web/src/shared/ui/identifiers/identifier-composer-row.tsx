import { useSelector } from "@tanstack/react-form";
import { LinkIcon, PencilIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  useRecordsByIds,
  type PickerPort,
} from "@/shared/hooks/use-picker-source";
import { isConfirmedBlocked } from "@/shared/lib/confirmed-evidence";
import { Chip } from "@/shared/ui/chip";
import {
  DataTableComposerActions,
  DataTableComposerRow,
  EditableSelectCell,
  EditableSuggestCell,
  EditableTextCell,
} from "@/shared/ui/data-table";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import {
  isHandleWithoutPlatform,
  PLATFORM_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
} from "@/shared/ui/identifiers/identifier-cells";
import {
  identifierCreateCanSubmit,
  type IdentifierCreateForm,
} from "@/shared/ui/identifiers/identifier-composer";
import {
  evidenceLabel,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { SearchedEvidencePicker } from "@/shared/ui/intake/searched-evidence-picker";
import { Button } from "@/shared/ui/primitives/button";
import { SearchedEntityCombobox } from "@/shared/ui/searched-entity-combobox";
import {
  identifierPlatformOptionMatchesQuery,
  CONFIDENCE_OPTIONS,
} from "@/shared/ui/vocab";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import {
  validateIdentifierWrite,
  HANDLE_REQUIRES_PLATFORM,
} from "@watchdog/schemas/graph";
import {
  trimmedConfidenceTierSchema,
  trimmedIdentifierStatusSchema,
  trimmedIdentifierTypeSchema,
  normalizeIdentifierPlatform,
  type IdentifierType,
} from "@watchdog/schemas/shared";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";
import { TableCell } from "@watchdog/ui/components/table";

function identifierWriteError(
  type: IdentifierType,
  value: string,
  platform: string
): string | undefined {
  const written = validateIdentifierWrite({ type, value, platform });
  return written.ok ? undefined : written.message;
}

type IdentifierComposerAppendProps = {
  form: IdentifierCreateForm;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSubmit: () => void;
  onCancel: () => void;
  /** The Case's Evidence picker reads (`evidencePickerPort(caseId)`). */
  evidencePort: PickerPort<EvidenceOption>;
  /** The Identifiers table's Entity column: the Case's Entity picker reads (`entityPickerPort`). */
  entityPicker?: { port: PickerPort<EntityOption> };
};

function ComposerEvidenceField({
  form,
  evidencePort,
}: {
  form: IdentifierCreateForm;
  evidencePort: PickerPort<EvidenceOption>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const firstId = useSelector(
    form.store,
    (state) => state.values.evidenceIds[0]
  );
  const titles = useRecordsByIds(
    evidencePort,
    firstId === undefined ? [] : [firstId]
  );

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
          const primary = selected[0] ? titles.get(selected[0]) : undefined;
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
                <Chip
                  size="sm"
                  className="max-w-full min-w-0 flex-1 justify-start overflow-hidden"
                  title={primaryLabel}
                >
                  <span className="block min-w-0 truncate">{primaryLabel}</span>
                </Chip>
              ) : null}
              {overflow > 0 ? (
                <span className="text-muted-foreground shrink-0 text-xs leading-tight tabular-nums">
                  +{overflow}
                </span>
              ) : null}
              <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size={selected.length > 0 ? "icon-sm" : "sm"}
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
                        "text-muted-foreground shrink-0",
                        selected.length === 0 &&
                          "gap-1 px-1 text-xs font-normal"
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
                  <SearchedEvidencePicker
                    port={evidencePort}
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

type ValueFieldProps = {
  form: IdentifierCreateForm;
  onKeyDown: (e: React.KeyboardEvent) => void;
  autoFocus: boolean;
};

function ValueField({ form, onKeyDown, autoFocus }: ValueFieldProps) {
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
              field.handleChange(trimmedIdentifierTypeSchema.parse(v));
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
  evidencePort,
  entityPicker,
}: IdentifierComposerAppendProps) {
  const shouldRequireEntity = entityPicker !== undefined;

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
              <SearchedEntityCombobox
                port={entityPicker.port}
                value={field.state.value}
                onValueChange={(id) => {
                  field.handleChange(id);
                }}
                shouldAllowEmpty={false}
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
              filter={identifierPlatformOptionMatchesQuery}
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
                field.handleChange(trimmedIdentifierStatusSchema.parse(v));
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
                field.handleChange(trimmedConfidenceTierSchema.parse(v));
              }}
              disabled={form.state.isSubmitting}
              onKeyDown={onKeyDown}
              aria-label="Confidence"
            />
          )}
        </form.Field>
      </TableCell>
      <ComposerEvidenceField form={form} evidencePort={evidencePort} />
      <form.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          values: state.values,
        })}
      >
        {({ isSubmitting, values }) => (
          <DataTableComposerActions
            isBusy={isSubmitting}
            canSubmit={identifierCreateCanSubmit(values, {
              shouldRequireEntity,
            })}
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
