import { useMemo, useState } from "react";

import {
  groupPlaybooksBySeed,
  playbookMatchesQuery,
} from "@/domains/jobs/lib/playbook-select-group";
import type { PlaybookListItem } from "@/domains/jobs/types";
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

interface PlaybookSelectProps {
  playbooks: readonly PlaybookListItem[];
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  allowThirdPartyEgress?: boolean;
  /** Highlight trigger when selected playbook needs Case egress. */
  needsEgress?: boolean;
  className?: string;
}

interface PlaybookGroup {
  value: string;
  items: PlaybookListItem[];
}

function PlaybookInfoCard({
  playbook,
  allowThirdPartyEgress,
}: {
  playbook: PlaybookListItem;
  allowThirdPartyEgress: boolean;
}) {
  const thirdPartyEgress =
    (playbook.requires.egress ?? "none") === "third_party";

  return (
    <div className="space-y-2 text-xs">
      <div>
        <p className="font-medium">{playbook.title}</p>
        <p className="text-muted-foreground font-mono text-[0.65rem] leading-snug">
          {playbook.id}
        </p>
      </div>
      {playbook.description === "" ? null : (
        <p className="text-muted-foreground leading-snug text-pretty">
          {playbook.description}
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Steps</dt>
        <dd className="font-mono text-[0.65rem] leading-snug">
          {playbook.steps.join(" → ")}
        </dd>
        <dt className="text-muted-foreground">Seed</dt>
        <dd className="leading-snug">{playbook.seedKinds.join(", ")}</dd>
        {thirdPartyEgress ? (
          <>
            <dt className="text-muted-foreground">Egress</dt>
            <dd>
              {allowThirdPartyEgress
                ? "third party (Case allows)"
                : "third party — enable on Case"}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

/**
 * Searchable Playbook Combobox grouped by seed kind.
 * Open popup: side panel follows highlight.
 */
export function PlaybookSelect({
  playbooks,
  value,
  onValueChange,
  disabled,
  allowThirdPartyEgress = false,
  needsEgress = false,
  className,
}: PlaybookSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const groups: PlaybookGroup[] = useMemo(
    () =>
      groupPlaybooksBySeed(playbooks).map((group) => ({
        value: group.label,
        items: group.playbooks,
      })),
    [playbooks]
  );

  const selected = playbooks.find((p) => p.id === value) ?? null;
  const preview =
    playbooks.find((p) => p.id === (highlightedId ?? value)) ??
    selected ??
    null;

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
      itemToStringLabel={(playbook) => (playbook ? playbook.title : "")}
      filter={(item, query) => {
        if (
          item !== null &&
          typeof item === "object" &&
          "id" in item &&
          "title" in item
        ) {
          return playbookMatchesQuery(item, query);
        }
        return true;
      }}
      onValueChange={(next: PlaybookListItem | null) => {
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
        aria-label="Playbook"
        placeholder="Select playbook…"
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
          <ComboboxEmpty>No playbooks match.</ComboboxEmpty>
          <ComboboxList className="max-h-80">
            {(group: PlaybookGroup, index: number) => (
              <ComboboxGroup key={group.value} items={group.items}>
                {index > 0 ? <ComboboxSeparator /> : null}
                <ComboboxLabel className="px-1.5">{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(playbook: PlaybookListItem) => (
                    <ComboboxItem key={playbook.id} value={playbook}>
                      <span className="min-w-0 flex-1 leading-snug whitespace-normal">
                        {playbook.title}
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
            <PlaybookInfoCard
              playbook={preview}
              allowThirdPartyEgress={allowThirdPartyEgress}
            />
          </div>
        ) : null}
      </ComboboxContent>
    </Combobox>
  );
}
