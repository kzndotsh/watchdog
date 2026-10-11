import { ArrowRightIcon } from "lucide-react";

import { parsePasteTarget } from "@/domains/entities/lib/bulk-add-paste-state";
import {
  identifierPasteColumnSamples,
  type IdentifierPasteTable,
  type IdentifierPasteTarget,
} from "@/domains/entities/lib/parse-identifier-paste";
import { FieldSelect } from "@/shared/ui/field-select";

export function BulkAddColumnMapper({
  table,
  mapping,
  fieldOptions,
  busy,
  onMap,
}: {
  table: IdentifierPasteTable;
  mapping: readonly IdentifierPasteTarget[];
  fieldOptions: { value: string; label: string }[];
  busy: boolean;
  onMap: (index: number, target: IdentifierPasteTarget) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="text-muted-foreground grid grid-cols-[1fr_auto_minmax(12rem,1fr)] items-center gap-3 border-b px-3 py-2 text-xs">
        <div>Your column</div>
        <div />
        <div>Watchdog field</div>
      </div>
      {table.columnLabels.map((label, index) => {
        const samples = identifierPasteColumnSamples(table, index);
        const target = mapping[index] ?? "skip";
        return (
          <div
            // oxlint-disable-next-line react-doctor/no-array-index-as-key -- column position is identity
            key={`col-${String(index)}-${label}`}
            className="grid grid-cols-[1fr_auto_minmax(12rem,1fr)] items-center gap-3 border-b px-3 py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm">
                {label || `Column ${index + 1}`}
              </div>
              {samples.length > 0 ? (
                <div className="text-muted-foreground truncate text-xs">
                  {samples.join(" · ")}
                </div>
              ) : null}
            </div>
            <ArrowRightIcon className="text-muted-foreground size-4 shrink-0" />
            <div className="min-w-0">
              <FieldSelect
                value={target}
                options={fieldOptions}
                onValueChange={(next) => {
                  const parsed = parsePasteTarget(next);
                  if (parsed !== null) onMap(index, parsed);
                }}
                disabled={busy}
                aria-label={`Map ${label || `column ${index + 1}`}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
