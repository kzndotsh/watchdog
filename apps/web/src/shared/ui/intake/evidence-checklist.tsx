import { useMemo } from "react";

import { cn, couldnt } from "@/lib/utils";
import type { PickerSource } from "@/shared/hooks/use-picker-source";
import { Eyebrow } from "@/shared/ui/eyebrow";
import {
  evidenceLabel,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { Button } from "@/shared/ui/primitives/button";
import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import { LIST_SEARCH_MIN_LENGTH } from "@watchdog/schemas/shared";
import { Checkbox } from "@watchdog/ui/components/checkbox";
import { Input } from "@watchdog/ui/components/input";

type EvidenceChecklistProps = {
  source: PickerSource<EvidenceOption>;
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
  idPrefix: string;
};

/** The selected records the page does not hold, first, while the box is empty: so they can be unticked. */
function checklistRows(
  source: PickerSource<EvidenceOption>,
  selectedIds: readonly string[]
): readonly EvidenceOption[] {
  if (source.text.trim() !== "") return source.options;
  const shown = new Set(source.options.map((row) => row.id));
  const extra = selectedIds.flatMap((id) => {
    const row = source.selected.get(id);
    return row === undefined || shown.has(id) ? [] : [row];
  });
  return extra.length === 0 ? source.options : [...extra, ...source.options];
}

function ChecklistMessage({
  source,
}: {
  source: PickerSource<EvidenceOption>;
}) {
  if (source.status === "pending") {
    return <p className="text-muted-foreground px-2 py-2 text-xs">Loading…</p>;
  }
  if (source.status === "error") {
    return (
      <p className="text-muted-foreground flex items-center gap-2 px-2 py-2 text-xs">
        {couldnt("load", "evidence")}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => {
            source.retry();
          }}
        >
          Retry
        </Button>
      </p>
    );
  }
  if (source.text.trim() === "") {
    return (
      <p className="text-muted-foreground px-2 py-3 text-xs">
        No Case Evidence yet — add some under Intake first.
      </p>
    );
  }
  return <p className="text-muted-foreground px-2 py-2 text-xs">No matches.</p>;
}

/**
 * The Evidence picker's body: its search box and the checklist of the source's options (the
 * selected records the page does not hold first, while the box is empty). Loaded lazily by
 * `EvidencePicker` (`evidence-checklist-load.ts`).
 */
export function EvidenceChecklist({
  source,
  selectedIds,
  onToggle,
  idPrefix,
}: EvidenceChecklistProps) {
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const rows = checklistRows(source, selectedIds);

  return (
    <div className="flex flex-col">
      <div className="border-border/60 border-b p-1.5">
        <Input
          value={source.text}
          onChange={(e) => {
            source.onTextChange(e.target.value);
          }}
          placeholder="Search label, notes or URL…"
          className="h-7 text-xs"
          aria-label="Search evidence"
        />
        {source.isShort ? (
          <p className="text-muted-foreground text-2xs px-0.5 pt-1">
            Type {LIST_SEARCH_MIN_LENGTH}+ characters to search; showing recent.
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <ChecklistMessage source={source} />
      ) : (
        <ul
          className="flex max-h-52 flex-col overflow-y-auto p-1"
          aria-label="Evidence options"
        >
          {rows.map((row) => {
            const checked = selectedIdSet.has(row.id);
            const checkboxId = `${idPrefix}-${row.id}`;
            const label = evidenceLabel(row);
            return (
              <li key={row.id}>
                <label
                  htmlFor={checkboxId}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs",
                    checked ? "bg-muted/60" : "hover:bg-muted/40"
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    className="size-3.5 shrink-0"
                    checked={checked}
                    onCheckedChange={(next) => {
                      onToggle(row.id, next);
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate" title={label}>
                    {label}
                  </span>
                  <Eyebrow className="shrink-0">{kindLabel(row.kind)}</Eyebrow>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
