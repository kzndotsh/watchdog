import { useMemo, useState } from "react";

import { groupCapsByCategory } from "@/domains/jobs/lib/cap-match";
import { capInfoRows, type CapInfoRow } from "@/domains/jobs/lib/cap-run-view";
import type { CapListItem } from "@/domains/jobs/types";
import { cn } from "@/lib/utils";
import { CONTROL_HEIGHT } from "@/shared/ui/control-chrome";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@/shared/ui/shadcn/combobox";

interface CapCapabilitySelectProps {
  caps: readonly CapListItem[];
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  /** Highlight trigger when selected Cap needs Case egress. */
  needsEgress?: boolean;
  className?: string;
}

interface CapGroup {
  value: string;
  items: CapListItem[];
}

function CapInfoCard({
  cap,
  rows,
}: {
  cap: CapListItem;
  rows: readonly CapInfoRow[];
}) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <p className="font-medium">{cap.title}</p>
        <p className="text-muted-foreground font-mono text-[0.65rem] leading-snug">
          {cap.id}
        </p>
      </div>
      {cap.description !== undefined && cap.description !== "" ? (
        <p className="text-muted-foreground leading-snug text-pretty">
          {cap.description}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd
                className={
                  row.mono === true
                    ? "font-mono text-[0.65rem] leading-snug break-all"
                    : "leading-snug"
                }
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function capMatchesQuery(cap: CapListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (cap.title.toLowerCase().includes(q)) return true;
  if (cap.id.toLowerCase().includes(q)) return true;
  if (cap.dataSource?.toLowerCase().includes(q)) return true;
  if (cap.description?.toLowerCase().includes(q)) return true;
  if ((cap.useCases ?? []).some((u) => u.toLowerCase().includes(q))) {
    return true;
  }
  return false;
}

/**
 * Searchable Cap Combobox grouped by category (`id` seg1).
 * Open popup: side panel follows highlight.
 */
export function CapCapabilitySelect({
  caps,
  value,
  onValueChange,
  disabled,
  needsEgress = false,
  className,
}: CapCapabilitySelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const groups: CapGroup[] = useMemo(
    () =>
      groupCapsByCategory(caps).map((g) => ({
        value: g.label,
        items: g.caps,
      })),
    [caps]
  );

  const selected = caps.find((c) => c.id === value) ?? null;
  const preview =
    caps.find((c) => c.id === (highlightedId ?? value)) ?? selected ?? null;

  return (
    <Combobox
      value={selected}
      items={groups}
      disabled={disabled}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setHighlightedId(next ? value || null : null);
      }}
      itemToStringLabel={(cap) => (cap ? cap.title : "")}
      filter={(item, query) => {
        // Group rows are filtered by Base UI via their leaf items; leaf = Cap.
        if (
          item !== null &&
          typeof item === "object" &&
          "id" in item &&
          "title" in item
        ) {
          return capMatchesQuery(item, query);
        }
        return true;
      }}
      onValueChange={(next: CapListItem | null) => {
        if (!next) {
          if (value !== "") onValueChange("");
          return;
        }
        if (next.id === value) return;
        onValueChange(next.id);
      }}
      onItemHighlighted={(item) => {
        setHighlightedId(item?.id ?? null);
      }}
    >
      <ComboboxInput
        showTrigger
        showClear={value !== ""}
        aria-label="Capability"
        placeholder="Select Cap…"
        className={cn(
          CONTROL_HEIGHT,
          "w-full max-w-full min-w-[12rem] [&_[data-slot=input-group-control]]:text-xs",
          needsEgress &&
            "border-warning/40 [&_[data-slot=input-group-control]]:text-warning",
          className
        )}
      />

      <ComboboxContent
        align="center"
        className="flex w-[min(100vw-2rem,36rem)] min-w-[22rem] flex-row overflow-hidden p-0"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <ComboboxEmpty>No Caps match.</ComboboxEmpty>
          <ComboboxList className="max-h-80">
            {(group: CapGroup, index: number) => (
              <ComboboxGroup key={group.value} items={group.items}>
                {index > 0 ? <ComboboxSeparator /> : null}
                <ComboboxLabel className="px-1.5">{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(cap: CapListItem) => (
                    <ComboboxItem key={cap.id} value={cap}>
                      <span className="min-w-0 flex-1 leading-snug whitespace-normal">
                        {cap.title}
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </div>
        {preview ? (
          <div className="border-border max-h-80 w-72 shrink-0 overflow-y-auto border-l p-3">
            <CapInfoCard cap={preview} rows={capInfoRows(preview)} />
          </div>
        ) : null}
      </ComboboxContent>
    </Combobox>
  );
}
