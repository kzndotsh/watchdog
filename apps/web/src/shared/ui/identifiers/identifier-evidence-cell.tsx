import { LinkIcon, PencilIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import {
  CONFIRMED_REQUIRES_EVIDENCE,
  isConfirmedBlocked,
} from "@/shared/lib/confirmed-evidence";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import { formatOpaqueId } from "@/shared/ui/format-opaque-id";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import {
  EvidencePicker,
  evidenceLabel,
} from "@/shared/ui/intake/evidence-picker";
import { Button } from "@/shared/ui/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/shared/ui/shadcn/popover";
import type { ConfidenceTier } from "@watchdog/schemas";

const PREVIEW_CHIP_MAX = 1;

export interface IdentifierEvidenceRow {
  id: string;
  confidence: ConfidenceTier;
  evidenceIds: string[];
}

function resolveEvidenceLabel(
  byId: Map<string, EvidenceOption>,
  evidenceId: string
): string {
  const row = byId.get(evidenceId);
  if (row) return evidenceLabel(row);
  return formatOpaqueId(evidenceId, 8);
}

function LinkedEvidenceSummary({
  options,
  evidenceIds,
  onEvidenceClick,
}: {
  options: readonly EvidenceOption[];
  evidenceIds: string[];
  onEvidenceClick?: (evidenceId: string) => void;
}) {
  const byId = useMemo(() => {
    const map = new Map<string, EvidenceOption>();
    for (const row of options) map.set(row.id, row);
    return map;
  }, [options]);

  const linked = evidenceIds.slice(0, PREVIEW_CHIP_MAX).map((id) => ({
    id,
    label: resolveEvidenceLabel(byId, id),
  }));
  const overflow = evidenceIds.length - linked.length;
  const primary = linked[0];
  if (!primary) return null;

  const label = (
    <span className="block min-w-0 truncate" title={primary.label}>
      {primary.label}
    </span>
  );

  return (
    <span className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
      {onEvidenceClick ? (
        <button
          type="button"
          className="hover:bg-muted/40 focus-visible:ring-ring flex max-w-full min-w-0 flex-1 overflow-hidden rounded-sm focus-visible:ring-1 focus-visible:outline-none"
          aria-label={`Preview evidence ${primary.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onEvidenceClick(primary.id);
          }}
        >
          <DetailStatusChip
            size="sm"
            className="w-full max-w-full min-w-0 justify-start overflow-hidden"
            title={primary.label}
          >
            {label}
          </DetailStatusChip>
        </button>
      ) : (
        <DetailStatusChip
          size="sm"
          className="max-w-full min-w-0 flex-1 justify-start overflow-hidden"
          title={primary.label}
        >
          {label}
        </DetailStatusChip>
      )}
      {overflow > 0 ? (
        <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

export function IdentifierEvidenceCell({
  row,
  evidenceOptions,
  onEvidenceClick,
  saveEvidence,
}: {
  row: IdentifierEvidenceRow;
  evidenceOptions: readonly EvidenceOption[];
  onEvidenceClick?: (evidenceId: string) => void;
  saveEvidence: (
    identifierId: string,
    evidenceIds: string[]
  ) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editEvidenceIds, setEditEvidenceIds] = useState<string[]>(
    row.evidenceIds
  );

  const confirmedBlocked = isConfirmedBlocked(row.confidence, editEvidenceIds);
  const hasLinks = row.evidenceIds.length > 0;

  return (
    <div
      className="flex w-full max-w-full min-w-0 items-center gap-1 overflow-hidden"
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
    >
      {hasLinks ? (
        <LinkedEvidenceSummary
          options={evidenceOptions}
          evidenceIds={row.evidenceIds}
          onEvidenceClick={onEvidenceClick}
        />
      ) : null}

      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setEditEvidenceIds(row.evidenceIds);
          }
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={hasLinks ? "Edit evidence links" : "Link evidence"}
              title={hasLinks ? "Edit evidence links" : "Link evidence"}
              className={cn(
                "shrink-0",
                hasLinks
                  ? "text-muted-foreground size-6 px-0"
                  : "text-muted-foreground h-6 gap-1 px-1 text-xs font-normal"
              )}
            />
          }
        >
          {hasLinks ? (
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
            <PopoverTitle className="text-xs">Link evidence</PopoverTitle>
          </PopoverHeader>
          <EvidencePicker
            options={evidenceOptions}
            selectedIds={editEvidenceIds}
            onChange={setEditEvidenceIds}
            layout="panel"
          />
          {confirmedBlocked ? (
            <FormInlineWarning>{CONFIRMED_REQUIRES_EVIDENCE}</FormInlineWarning>
          ) : null}
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-6 text-xs"
              loading={saving}
              disabled={confirmedBlocked}
              onClick={() => {
                void (async () => {
                  setSaving(true);
                  try {
                    await saveEvidence(row.id, editEvidenceIds);
                    setOpen(false);
                  } catch {
                    // Parent toasts; keep popover open for retry.
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
