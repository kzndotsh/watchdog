import { ChevronDownIcon, PaperclipIcon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { CONTROL_FIELD_TRIGGER } from "@/shared/ui/control-chrome";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { formatOpaqueId } from "@/shared/ui/format-opaque-id";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Input } from "@/shared/ui/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/shadcn/popover";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";
import { WithTooltip } from "@/shared/ui/timestamp";
import { KindBadge } from "@/shared/ui/vocab";

export type { EvidenceOption } from "@/shared/ui/intake/evidence-option";

const FILTER_THRESHOLD = 8;

function evidenceLabel(row: EvidenceOption): string {
  const label = row.label?.trim();
  if (label !== undefined && label !== "") return label;
  const sourceUrl = row.sourceUrl?.trim();
  if (sourceUrl !== undefined && sourceUrl !== "") return sourceUrl;
  if (row.sha256 !== undefined && row.sha256 !== null && row.sha256 !== "")
    return `${row.kind} · ${formatOpaqueId(row.sha256, 8)}`;
  return `${row.kind} · ${formatOpaqueId(row.id, 8)}`;
}

/**
 * Read-only Job/proposal cite chips.
 */
export function EvidenceCiteChips({
  options,
  ids,
  className,
  withIcon = false,
}: {
  options: EvidenceOption[];
  ids: string[];
  className?: string;
  /** Swap the "Evidence" text label for an icon + tooltip in dense bands. */
  withIcon?: boolean;
}) {
  const byId = useMemo(() => {
    const map = new Map<string, EvidenceOption>();
    for (const row of options) map.set(row.id, row);
    return map;
  }, [options]);

  const rows = ids
    .map((id) => byId.get(id))
    .filter((row): row is EvidenceOption => row !== undefined);

  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
    >
      {withIcon ? (
        <WithTooltip content="Evidence" wrapSpan className="inline-flex">
          <PaperclipIcon
            aria-hidden
            className="text-muted-foreground size-3.5 shrink-0"
          />
        </WithTooltip>
      ) : (
        <span className="text-muted-foreground text-xs">Evidence</span>
      )}
      {rows.map((row) => (
        <DetailStatusChip
          key={row.id}
          size="sm"
          className="max-w-[12rem] truncate"
          title={evidenceLabel(row)}
        >
          {evidenceLabel(row)}
          <span className="text-muted-foreground">· Job</span>
        </DetailStatusChip>
      ))}
    </div>
  );
}

/** Loading shell beside confidence — matches picker trigger or cite chips. */
export function EvidenceSlotSkeleton({
  mode,
  citeCount = 1,
  className,
}: {
  mode: "cite" | "pick";
  citeCount?: number;
  className?: string;
}) {
  if (mode === "cite") {
    const count = Math.max(citeCount, 1);
    return (
      <div
        className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
        aria-busy
        aria-live="polite"
        aria-label="Loading evidence"
      >
        <WithTooltip content="Evidence" wrapSpan className="inline-flex">
          <PaperclipIcon
            aria-hidden
            className="text-muted-foreground size-3.5 shrink-0"
          />
        </WithTooltip>
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton key={index} className="h-6 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("flex min-w-0 items-center", className)}
      aria-busy
      aria-live="polite"
      aria-label="Loading evidence"
    >
      <Skeleton className={cn(CONTROL_FIELD_TRIGGER, "w-32 border-dashed")} />
    </div>
  );
}

/**
 * Dense multi-select Case Evidence — chips + Add popover.
 * Options are passed in — parent owns fetch (same contract as EntityCombobox).
 */
export function EvidencePicker({
  options,
  selectedIds,
  onChange,
  className,
  dashedWhenEmpty = false,
}: {
  options: EvidenceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  /**
   * Dashed trigger instead of trailing helper text when nothing is selected.
   * For bands that already message the confirmed-needs-evidence gate elsewhere.
   */
  dashedWhenEmpty?: boolean;
}) {
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
  const showFilter = options.length > FILTER_THRESHOLD;
  const q = filter.trim().toLowerCase();
  const filteredOptions =
    q === ""
      ? options
      : options.filter((row) => evidenceLabel(row).toLowerCase().includes(q));

  function toggle(id: string, checked: boolean) {
    if (checked) {
      onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter((x) => x !== id));
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Popover
          onOpenChange={(open) => {
            if (!open) setFilter("");
          }}
        >
          <PopoverTrigger
            data-slot="select-trigger"
            data-size="default"
            className={cn(
              CONTROL_FIELD_TRIGGER,
              dashedWhenEmpty && totalCount === 0 && "border-dashed"
            )}
            aria-label={
              totalCount > 0
                ? `Evidence, ${totalCount} selected`
                : "Add evidence"
            }
          >
            <span data-slot="select-value" className="flex flex-1 text-left">
              {totalCount > 0 ? `Evidence · ${totalCount}` : "Add evidence"}
            </span>
            <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[18rem] space-y-2 p-2">
            {options.length === 0 ? (
              <p className="text-muted-foreground px-1 py-2 text-xs">
                No Case Evidence yet — add some under Intake first.
              </p>
            ) : (
              <>
                {showFilter ? (
                  <Input
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                    }}
                    placeholder="Filter evidence…"
                    className="h-8 text-xs"
                    aria-label="Filter evidence"
                  />
                ) : null}
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {filteredOptions.length === 0 ? (
                    <li className="text-muted-foreground px-1 py-2 text-xs">
                      No matches.
                    </li>
                  ) : (
                    filteredOptions.map((row) => {
                      const checked = selectedIds.includes(row.id);
                      const checkboxId = `${idPrefix}-${row.id}`;
                      return (
                        <li key={row.id}>
                          <label
                            htmlFor={checkboxId}
                            className="text-foreground hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm"
                          >
                            <Checkbox
                              id={checkboxId}
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={(next) => {
                                toggle(row.id, next);
                              }}
                            />
                            <span className="flex min-w-0 flex-wrap items-center gap-1">
                              <span className="min-w-0 truncate">
                                {evidenceLabel(row)}
                              </span>
                              <KindBadge kind={row.kind} size="sm" />
                            </span>
                          </label>
                        </li>
                      );
                    })
                  )}
                </ul>
              </>
            )}
          </PopoverContent>
        </Popover>

        {selectedRows.map((row) => (
          <DetailStatusChip
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
          </DetailStatusChip>
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
