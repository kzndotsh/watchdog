import { BulkAddColumnMapper } from "@/domains/entities/components/bulk-add-column-mapper";
import { BulkAddIdentifiersPreviewTable } from "@/domains/entities/components/bulk-add-identifiers-preview-table";
import type {
  IdentifierPasteEntity,
  IdentifierPasteRow,
  IdentifierPasteRowOverride,
  IdentifierPasteTable,
  IdentifierPasteTarget,
} from "@/domains/entities/lib/parse-identifier-paste";
import type { PickerPort } from "@/shared/hooks/use-picker-source";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import { SearchedEntityCombobox } from "@/shared/ui/searched-entity-combobox";
import { IDENTIFIER_PLATFORM_OPTIONS } from "@/shared/ui/vocab";
import { Field, FieldLabel } from "@watchdog/ui/components/field";

type BulkAddMapStageProps = {
  table: IdentifierPasteTable;
  mapping: readonly IdentifierPasteTarget[];
  rows: IdentifierPasteRow[];
  entityPort: PickerPort<EntityOption>;
  /** Records a picked Entity, so a row can name it. */
  onPickEntity: (entity: EntityOption | null) => void;
  lockEntity: IdentifierPasteEntity | null;
  shouldShowPlatform: boolean;
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
  isBusy: boolean;
};

export function BulkAddMapStage({
  table,
  mapping,
  rows,
  entityPort,
  onPickEntity,
  lockEntity,
  shouldShowPlatform,
  defaultEntityId,
  setDefaultEntityId,
  defaultPlatform,
  setDefaultPlatform,
  fieldOptions,
  setColumnMapping,
  setRowPatch,
  isBusy,
}: BulkAddMapStageProps) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <Field>
          <FieldLabel>Entity</FieldLabel>
          {lockEntity === null ? (
            <SearchedEntityCombobox
              port={entityPort}
              value={defaultEntityId}
              onValueChange={setDefaultEntityId}
              onEntityChange={onPickEntity}
              shouldAllowEmpty
              disabled={isBusy}
              emptyLabel="Entity"
              aria-label="Default entity"
            />
          ) : (
            <EntityCombobox
              entities={[
                {
                  id: lockEntity.id,
                  name: lockEntity.name,
                  slug: lockEntity.slug,
                },
              ]}
              value={lockEntity.id}
              onValueChange={setDefaultEntityId}
              shouldAllowEmpty={false}
              disabled
              emptyLabel="Entity"
              aria-label="Default entity"
            />
          )}
          {lockEntity === null ? (
            <p className="text-muted-foreground text-xs">
              Applies to all rows. Change a row to override.
            </p>
          ) : null}
        </Field>
        {shouldShowPlatform ? (
          <Field>
            <FieldLabel>Platform</FieldLabel>
            <FieldSelect
              value={defaultPlatform}
              options={[
                { value: "", label: "—" },
                ...IDENTIFIER_PLATFORM_OPTIONS,
              ]}
              placeholder="—"
              onValueChange={setDefaultPlatform}
              disabled={isBusy}
              aria-label="Default platform"
            />
          </Field>
        ) : null}
      </div>

      <BulkAddColumnMapper
        table={table}
        mapping={mapping}
        fieldOptions={fieldOptions}
        isBusy={isBusy}
        onMap={setColumnMapping}
      />

      {table.isTruncated ? (
        <FormInlineWarning>
          Showing first 200 rows ({table.rawDataCount} pasted).
        </FormInlineWarning>
      ) : null}

      {rows.length > 0 ? (
        <BulkAddIdentifiersPreviewTable
          rows={rows}
          entityPort={entityPort}
          onPickEntity={onPickEntity}
          lockEntity={lockEntity}
          isBusy={isBusy}
          setRowPatch={setRowPatch}
        />
      ) : null}
    </>
  );
}
