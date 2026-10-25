import { useMemo, useState } from "react";

import { BreachDisabledNote } from "@/domains/jobs/components/breach-disabled-note";
import {
  BREACH_DISABLED_ROW_TEXT,
  isBreachDisabled,
} from "@/domains/jobs/lib/breach-disabled";
import {
  egressBlockOf,
  egressClassesPhrase,
} from "@/domains/jobs/lib/egress-block";
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
} from "@/shared/ui/primitives/combobox";
import { capabilityLabel } from "@/shared/ui/vocab/capability";
import { DEFAULT_ALLOWED_EGRESS } from "@watchdog/schemas/caps";
import { trimmedOrUndefined, type EgressClass } from "@watchdog/schemas/shared";

type PlaybookSelectProps = {
  playbooks: readonly PlaybookListItem[];
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  allowedEgress?: readonly EgressClass[];
  /** Highlight trigger when selected playbook needs Case egress. */
  isEgressNeeded?: boolean;
  className?: string;
};

type PlaybookGroup = {
  value: string;
  items: PlaybookListItem[];
};

function PlaybookInfoCard({
  playbook,
  allowedEgress,
}: {
  playbook: PlaybookListItem;
  allowedEgress: readonly EgressClass[];
}) {
  const needed = playbook.requires.egress.filter((c) => c !== "local");
  const egressBlock = egressBlockOf(playbook.requires, allowedEgress);

  return (
    <div className="space-y-2 text-xs">
      <div>
        <p>{playbook.title}</p>
        <p className="text-muted-foreground text-2xs font-mono leading-snug">
          {playbook.id}
        </p>
      </div>
      {isBreachDisabled(playbook) ? <BreachDisabledNote /> : null}
      {playbook.description === "" ? null : (
        <p className="text-muted-foreground leading-snug text-pretty">
          {playbook.description}
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Steps</dt>
        <dd className="text-2xs font-mono leading-snug">
          {playbook.steps.map((step) => capabilityLabel(step)).join(" → ")}
        </dd>
        <dt className="text-muted-foreground">Seed</dt>
        <dd className="leading-snug">{playbook.seedKinds.join(", ")}</dd>
        {needed.length > 0 ? (
          <>
            <dt className="text-muted-foreground">Egress</dt>
            <dd>
              {egressBlock === undefined
                ? `${egressClassesPhrase(needed)} (Case allows)`
                : `${egressClassesPhrase(egressBlock.classes)} — enable on Case`}
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
  allowedEgress = DEFAULT_ALLOWED_EGRESS,
  isEgressNeeded = false,
  className,
}: PlaybookSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const groups: PlaybookGroup[] = useMemo(
    () =>
      groupPlaybooksBySeed(playbooks).map((group) => ({
        value: group.label,
        items: group.playbooks,
      })),
    [playbooks]
  );

  const scopedValue = trimmedOrUndefined(value) ?? "";
  const hasDisabledPlaybooks = playbooks.some((p) => isBreachDisabled(p));

  const selected = playbooks.find((p) => p.id === scopedValue) ?? null;
  const preview =
    playbooks.find((p) => p.id === (highlightedId ?? scopedValue)) ??
    selected ??
    null;

  return (
    <Combobox
      value={selected}
      items={groups}
      disabled={disabled}
      open={isOpen}
      onOpenChange={(next) => {
        setIsOpen(next);
        setHighlightedId(next ? scopedValue || null : null);
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
        tone={isEgressNeeded ? "warning" : "default"}
        className={cn(
          CONTROL_HEIGHT,
          "w-full max-w-full min-w-[12rem]",
          className
        )}
      />

      <ComboboxContent
        align="center"
        className="flex w-[min(100vw-2rem,36rem)] min-w-[22rem] flex-row overflow-hidden"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <ComboboxEmpty>No playbooks match.</ComboboxEmpty>
          <ComboboxList className="max-h-80">
            {(group: PlaybookGroup, index: number) => (
              <ComboboxGroup key={group.value} items={group.items}>
                {index > 0 ? <ComboboxSeparator /> : null}
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(playbook: PlaybookListItem) => (
                    <ComboboxItem
                      key={playbook.id}
                      value={playbook}
                      disabled={isBreachDisabled(playbook)}
                    >
                      <span className="min-w-0 flex-1 leading-snug whitespace-normal">
                        {playbook.title}
                        {isBreachDisabled(playbook) ? (
                          <span className="text-muted-foreground text-2xs block">
                            {BREACH_DISABLED_ROW_TEXT}
                          </span>
                        ) : null}
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
          {hasDisabledPlaybooks ? (
            <div className="border-border border-t p-3">
              <BreachDisabledNote />
            </div>
          ) : null}
        </div>
        {preview ? (
          <div className="border-border max-h-80 w-72 shrink-0 overflow-y-auto border-l p-3">
            <PlaybookInfoCard
              playbook={preview}
              allowedEgress={allowedEgress}
            />
          </div>
        ) : null}
      </ComboboxContent>
    </Combobox>
  );
}
