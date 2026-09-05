import {
  BulkAddColumnMapper,
  BulkAddIdentifiersPreviewTable,
} from "@/domains/entities/components/bulk-add-identifiers-preview";
import type {
  IdentifierPasteEntity,
  IdentifierPasteRow,
  IdentifierPasteRowOverride,
  IdentifierPasteTable,
  IdentifierPasteTarget,
} from "@/domains/entities/lib/parse-identifier-paste";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import { Field, FieldLabel } from "@/shared/ui/shadcn/field";
import { IDENTIFIER_PLATFORM_OPTIONS } from "@/shared/ui/vocab";

interface BulkAddMapStageProps {
  table: IdentifierPasteTable;
  mapping: readonly IdentifierPasteTarget[];
  rows: IdentifierPasteRow[];
  entityOptions: EntityOption[];
  lockEntity: IdentifierPasteEntity | null;
  showPlatform: boolean;
  defaultEntityId: string;
  setDefaultEntityId: (id: string) => void;
  defaultPlatform: string;
  setDefaultPlatform: (platform: string) => void;
  fieldOptions: { value: string; label: string }[];
  setColumnMapping: (index: number, target: IdentifierPasteTarget) => void;
  setRowPatch: (
    row: IdentifierPasteRow,
    patch: IdentifierPasteRowOverride
  ) => void;
  busy: boolean;
}

export function BulkAddMapStage({
  table,
  mapping,
  rows,
  entityOptions,
  lockEntity,
  showPlatform,
  defaultEntityId,
  setDefaultEntityId,
  defaultPlatform,
  setDefaultPlatform,
  fieldOptions,
  setColumnMapping,
  setRowPatch,
  busy,
}: BulkAddMapStageProps) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <Field className="gap-1">
          <FieldLabel>Entity</FieldLabel>
          <EntityCombobox
            entities={
              lockEntity === null
                ? entityOptions
                : [
                    {
                      id: lockEntity.id,
                      name: lockEntity.name,
                      slug: lockEntity.slug,
                    },
                  ]
            }
            value={lockEntity?.id ?? defaultEntityId}
            onValueChange={setDefaultEntityId}
            allowEmpty={lockEntity === null}
            disabled={lockEntity !== null || busy}
            emptyLabel="Entity"
            aria-label="Default entity"
          />
          {lockEntity === null ? (
            <p className="text-muted-foreground text-xs">
              Applies to all rows. Change a row to override.
            </p>
          ) : null}
        </Field>
        {showPlatform ? (
          <Field className="gap-1">
            <FieldLabel>Platform</FieldLabel>
            <FieldSelect
              value={defaultPlatform}
              options={[
                { value: "", label: "—" },
                ...IDENTIFIER_PLATFORM_OPTIONS,
              ]}
              placeholder="—"
              onValueChange={setDefaultPlatform}
              disabled={busy}
              aria-label="Default platform"
            />
          </Field>
        ) : null}
      </div>

      <BulkAddColumnMapper
        table={table}
        mapping={mapping}
        fieldOptions={fieldOptions}
        busy={busy}
        onMap={setColumnMapping}
      />

      {table.truncated ? (
        <FormInlineWarning>
          Showing first 200 rows ({table.rawDataCount} pasted).
        </FormInlineWarning>
      ) : null}

      {rows.length > 0 ? (
        <BulkAddIdentifiersPreviewTable
          rows={rows}
          entityOptions={entityOptions}
          lockEntity={lockEntity}
          busy={busy}
          setRowPatch={setRowPatch}
        />
      ) : null}
    </>
  );
}
