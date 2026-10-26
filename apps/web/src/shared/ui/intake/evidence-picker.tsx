import { PaperclipIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useMemo } from "react";

import { cn, couldnt } from "@/lib/utils";
import type { PickerSource } from "@/shared/hooks/use-picker-source";
import { Chip } from "@/shared/ui/chip";
import { Eyebrow } from "@/shared/ui/eyebrow";
import {
  evidenceLabel,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { EVIDENCE_PICKER_TRIGGER_CLASS } from "@/shared/ui/intake/evidence-picker-trigger-class";
import { Button } from "@/shared/ui/primitives/button";
import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import { LIST_SEARCH_MIN_LENGTH } from "@watchdog/schemas/shared";
import { Checkbox } from "@watchdog/ui/components/checkbox";
import { Input } from "@watchdog/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

export type { EvidenceOption } from "@/shared/ui/intake/evidence-option";

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

function EvidenceChecklist({
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

type EvidencePickerProps = {
  /** The options, the typed text and the selected records (`usePickerSource`, or a static source). */
  source: PickerSource<EvidenceOption>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  /**
   * Dashed trigger instead of trailing helper text when nothing is selected.
   * For bands that already message the confirmed-needs-evidence gate elsewhere.
   */
  shouldDashWhenEmpty?: boolean;
  /** `trigger` = chips + add control. `panel` = checklist only. */
  layout?: "trigger" | "panel";
  /** The add popover opened or closed (`trigger` only): a server source reads only while open. */
  onOpenChange?: (open: boolean) => void;
};

/**
 * Dense multi-select Case Evidence — chips + compact add popover. No I/O: the `source` holds
 * the options and the selected records (`SearchedEvidencePicker` reads them from the server).
 *
 * `layout="panel"` = checklist only (for parent popovers like identifier cells).
 */
export function EvidencePicker({
  source,
  selectedIds,
  onChange,
  className,
  shouldDashWhenEmpty = false,
  layout = "trigger",
  onOpenChange,
}: EvidencePickerProps) {
  const idPrefix = useId();
  const byId = new Map<string, EvidenceOption>(source.selected);
  for (const row of source.options) byId.set(row.id, row);

  const selectedRows = selectedIds
    .map((id) => byId.get(id))
    .filter((row): row is EvidenceOption => row !== undefined);

  const totalCount = selectedIds.length;

  function handleToggle(id: string, isChecked: boolean) {
    if (isChecked) {
      onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter((x) => x !== id));
    }
  }

  const checklist = (
    <EvidenceChecklist
      source={source}
      selectedIds={selectedIds}
      onToggle={handleToggle}
      idPrefix={idPrefix}
    />
  );

  if (layout === "panel") {
    return <div className={cn("min-w-0", className)}>{checklist}</div>;
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Popover
          onOpenChange={(open) => {
            if (!open) source.onTextChange("");
            onOpenChange?.(open);
          }}
        >
          <PopoverTrigger
            className={cn(
              EVIDENCE_PICKER_TRIGGER_CLASS,
              totalCount === 0 ? "gap-1 px-1.5" : "size-5 justify-center px-0",
              shouldDashWhenEmpty && totalCount === 0 && "border-dashed"
            )}
            aria-label={
              totalCount > 0
                ? `Add evidence, ${totalCount} selected`
                : "Add evidence"
            }
          >
            {totalCount === 0 ? (
              <>
                <PaperclipIcon className="size-3 shrink-0" aria-hidden />
                <span>Add</span>
              </>
            ) : (
              <PlusIcon className="size-3 shrink-0" aria-hidden />
            )}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 gap-0 overflow-hidden rounded-md p-0"
          >
            {checklist}
          </PopoverContent>
        </Popover>

        {selectedRows.map((row) => (
          <Chip
            key={row.id}
            size="sm"
            className="max-w-[14rem] gap-0.5 pr-0.5"
            title={evidenceLabel(row)}
          >
            <span className="truncate">{evidenceLabel(row)}</span>
            <button
              type="button"
              className="hover:bg-muted rounded-sm p-0.5"
              aria-label={`Remove ${evidenceLabel(row)}`}
              onClick={() => {
                onChange(selectedIds.filter((x) => x !== row.id));
              }}
            >
              <XIcon className="size-3" />
            </button>
          </Chip>
        ))}

        {totalCount === 0 && !shouldDashWhenEmpty ? (
          <span className="text-muted-foreground text-xs">
            None · required for confirmed
          </span>
        ) : null}
      </div>
    </div>
  );
}
