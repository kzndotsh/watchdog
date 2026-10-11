import { PaperclipIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { Chip } from "@/shared/ui/chip";
import {
  evidenceLabel,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { WithTooltip } from "@/shared/ui/with-tooltip";

type EvidenceCiteChipsProps = {
  options: readonly EvidenceOption[];
  ids: string[];
  className?: string;
  /** Swap the "Evidence" text label for an icon + tooltip in dense bands. */
  withIcon?: boolean;
};

/**
 * Read-only Job/proposal cite chips.
 */
export function EvidenceCiteChips({
  options,
  ids,
  className,
  withIcon = false,
}: EvidenceCiteChipsProps) {
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
        <Chip
          key={row.id}
          size="sm"
          className="max-w-[12rem] truncate"
          title={evidenceLabel(row)}
        >
          {evidenceLabel(row)}
          <span className="text-muted-foreground">· Job</span>
        </Chip>
      ))}
    </div>
  );
}
