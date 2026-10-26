import { LinkIcon, PencilIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { PickerPort } from "@/shared/hooks/use-picker-source";
import { isConfirmedBlocked } from "@/shared/lib/confirmed-evidence";
import { Chip } from "@/shared/ui/chip";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import { formatOpaqueId } from "@/shared/ui/format-opaque-id";
import {
  evidenceLabel,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { SearchedEvidencePicker } from "@/shared/ui/intake/searched-evidence-picker";
import { Button } from "@/shared/ui/primitives/button";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import type { ConfidenceTier } from "@watchdog/schemas/shared";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

const PREVIEW_CHIP_MAX = 1;

export type IdentifierEvidenceRow = {
  id: string;
  version: number;
  confidence: ConfidenceTier;
  evidenceIds: string[];
};

/**
 * How a table names and picks a row's Evidence: the Case's Evidence picker reads (`port`), and
 * the titles of the Evidence its loaded rows link (a by-ids read of those ids, never the list).
 */
export type EvidenceLinks = {
  readonly port: PickerPort<EvidenceOption>;
  readonly titles: ReadonlyMap<string, EvidenceOption>;
};

function resolveEvidenceLabel(
  byId: ReadonlyMap<string, EvidenceOption>,
  evidenceId: string
): string {
  const row = byId.get(evidenceId);
  if (row) return evidenceLabel(row);
  return formatOpaqueId(evidenceId, 8);
}

type LinkedEvidenceSummaryProps = {
  titles: ReadonlyMap<string, EvidenceOption>;
  evidenceIds: string[];
  onEvidenceClick?: (evidenceId: string) => void;
};

function LinkedEvidenceSummary({
  titles,
  evidenceIds,
  onEvidenceClick,
}: LinkedEvidenceSummaryProps) {
  const linked = evidenceIds.slice(0, PREVIEW_CHIP_MAX).map((id) => ({
    id,
    label: resolveEvidenceLabel(titles, id),
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
          <Chip
            size="sm"
            className="w-full max-w-full min-w-0 justify-start overflow-hidden"
            title={primary.label}
          >
            {label}
          </Chip>
        </button>
      ) : (
        <Chip
          size="sm"
          className="max-w-full min-w-0 flex-1 justify-start overflow-hidden"
          title={primary.label}
        >
          {label}
        </Chip>
      )}
      {overflow > 0 ? (
        <span className="text-muted-foreground shrink-0 text-xs leading-tight tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

type IdentifierEvidenceCellProps = {
  row: IdentifierEvidenceRow;
  evidence: EvidenceLinks;
  onEvidenceClick?: (evidenceId: string) => void;
  /** `target.version` is the Identifier's version when the popover opened. */
  saveEvidence: (
    target: { id: string; version: number },
    evidenceIds: string[]
  ) => void | Promise<void>;
};

export function IdentifierEvidenceCell({
  row,
  evidence,
  onEvidenceClick,
  saveEvidence,
}: IdentifierEvidenceCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editEvidenceIds, setEditEvidenceIds] = useState<string[]>(
    row.evidenceIds
  );
  // The version the picked set was loaded at, not the row's latest: a change that lands while the
  // popover is open must fail the save as stale rather than be overwritten.
  const loadedVersionRef = useRef(row.version);

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
          titles={evidence.titles}
          evidenceIds={row.evidenceIds}
          onEvidenceClick={onEvidenceClick}
        />
      ) : null}

      <Popover
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setEditEvidenceIds(row.evidenceIds);
            loadedVersionRef.current = row.version;
          }
          setIsOpen(nextOpen);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size={hasLinks ? "icon-sm" : "sm"}
              aria-label={hasLinks ? "Edit evidence links" : "Link evidence"}
              title={hasLinks ? "Edit evidence links" : "Link evidence"}
              className={cn(
                "text-muted-foreground shrink-0",
                !hasLinks && "gap-1 px-1 text-xs font-normal"
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
          <SearchedEvidencePicker
            port={evidence.port}
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
              className="text-xs"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs"
              loading={isSaving}
              disabled={confirmedBlocked}
              onClick={() => {
                void (async () => {
                  setIsSaving(true);
                  try {
                    await saveEvidence(
                      { id: row.id, version: loadedVersionRef.current },
                      editEvidenceIds
                    );
                    setIsOpen(false);
                  } catch {
                    // Parent toasts; keep popover open for retry.
                  } finally {
                    setIsSaving(false);
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
