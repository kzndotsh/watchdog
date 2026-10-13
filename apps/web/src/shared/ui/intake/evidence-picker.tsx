import { PaperclipIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { Chip } from "@/shared/ui/chip";
import { Eyebrow } from "@/shared/ui/eyebrow";
import {
  evidenceLabel,
  evidenceMatchesPickerFilter,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { EVIDENCE_PICKER_TRIGGER_CLASS } from "@/shared/ui/intake/evidence-picker-trigger-class";
import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import { Checkbox } from "@watchdog/ui/components/checkbox";
import { Input } from "@watchdog/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

export type { EvidenceOption } from "@/shared/ui/intake/evidence-option";

const FILTER_THRESHOLD = 8;

type EvidenceChecklistProps = {
  options: readonly EvidenceOption[];
  selectedIds: string[];
  filter: string;
  onFilterChange: (next: string) => void;
  onToggle: (id: string, checked: boolean) => void;
  idPrefix: string;
};

function EvidenceChecklist({
  options,
  selectedIds,
  filter,
  onFilterChange,
  onToggle,
  idPrefix,
}: EvidenceChecklistProps) {
  const showFilter = options.length > FILTER_THRESHOLD;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredOptions = options.filter((row) =>
    evidenceMatchesPickerFilter(row, filter)
  );

  if (options.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-3 text-xs">
        No Case Evidence yet — add some under Intake first.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {showFilter ? (
        <div className="border-border/60 border-b p-1.5">
          <Input
            value={filter}
            onChange={(e) => {
              onFilterChange(e.target.value);
            }}
            placeholder="Filter…"
            className="h-7 text-xs"
            aria-label="Filter evidence"
          />
        </div>
      ) : null}
      <ul
        className="flex max-h-52 flex-col overflow-y-auto p-1"
        aria-label="Evidence options"
      >
        {filteredOptions.length === 0 ? (
          <li className="text-muted-foreground px-2 py-2 text-xs">
            No matches.
          </li>
        ) : (
          filteredOptions.map((row) => {
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
          })
        )}
      </ul>
    </div>
  );
}

type EvidencePickerProps = {
  options: readonly EvidenceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  /**
   * Dashed trigger instead of trailing helper text when nothing is selected.
   * For bands that already message the confirmed-needs-evidence gate elsewhere.
   */
  dashedWhenEmpty?: boolean;
  /** `trigger` = chips + add control. `panel` = checklist only. */
  layout?: "trigger" | "panel";
};

/**
 * Dense multi-select Case Evidence — chips + compact add popover.
 * Options are passed in — parent owns fetch (same contract as EntityCombobox).
 *
 * `layout="panel"` = checklist only (for parent popovers like identifier cells).
 */
export function EvidencePicker({
  options,
  selectedIds,
  onChange,
  className,
  dashedWhenEmpty = false,
  layout = "trigger",
}: EvidencePickerProps) {
  const idPrefix = useId();
  const [filter, setFilter] = useState("");
  const byId = useMemo(() => {
    const map = new Map<string, EvidenceOption>();
    for (const row of options) map.set(row.id, row);
    return map;
  }, [options]);

  const selectedRows = selectedIds
    .map((id) => byId.get(id))
    .filter((row): row is EvidenceOption => row !== undefined);

  const totalCount = selectedIds.length;

  function handleToggle(id: string, checked: boolean) {
    if (checked) {
      onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter((x) => x !== id));
    }
  }

  const checklist = (
    <EvidenceChecklist
      options={options}
      selectedIds={selectedIds}
      filter={filter}
      onFilterChange={setFilter}
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
            if (!open) setFilter("");
          }}
        >
          <PopoverTrigger
            className={cn(
              EVIDENCE_PICKER_TRIGGER_CLASS,
              totalCount === 0 ? "gap-1 px-1.5" : "size-5 justify-center px-0",
              dashedWhenEmpty && totalCount === 0 && "border-dashed"
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

        {totalCount === 0 && !dashedWhenEmpty ? (
          <span className="text-muted-foreground text-xs">
            None · required for confirmed
          </span>
        ) : null}
      </div>
    </div>
  );
}
