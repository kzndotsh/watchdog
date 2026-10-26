import { PaperclipIcon, PlusIcon, XIcon } from "lucide-react";
import { lazy, Suspense, useId } from "react";

import { cn } from "@/lib/utils";
import type { PickerSource } from "@/shared/hooks/use-picker-source";
import { prefetchImport } from "@/shared/lib/preload-import";
import { Chip } from "@/shared/ui/chip";
import { loadEvidenceChecklist } from "@/shared/ui/intake/evidence-checklist-load";
import {
  evidenceLabel,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { EVIDENCE_PICKER_TRIGGER_CLASS } from "@/shared/ui/intake/evidence-picker-trigger-class";
import { PopoverBodyFallback } from "@/shared/ui/list/parts/popover-body-fallback";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

export type { EvidenceOption } from "@/shared/ui/intake/evidence-option";

const LazyEvidenceChecklist = lazy(async () => {
  const { EvidenceChecklist } = await loadEvidenceChecklist();
  return { default: EvidenceChecklist };
});

function warmChecklist() {
  void prefetchImport(loadEvidenceChecklist);
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

  // The checklist (search box, checkboxes) is a lazy chunk, warmed on hover or focus of the
  // trigger: a screen pays for it only when someone opens the picker.
  const checklist = (
    <Suspense fallback={<PopoverBodyFallback />}>
      <LazyEvidenceChecklist
        source={source}
        selectedIds={selectedIds}
        onToggle={handleToggle}
        idPrefix={idPrefix}
      />
    </Suspense>
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
            onPointerEnter={warmChecklist}
            onFocus={warmChecklist}
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
