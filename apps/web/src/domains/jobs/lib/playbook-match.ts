import { playbookSeedRequirements } from "@/domains/jobs/lib/playbook-seed-requirements";
import type { PlaybookListItem } from "@/domains/jobs/types";
import { egressClassLabel } from "@watchdog/schemas/caps";
import {
  EGRESS_CLASSES,
  PLAYBOOK_SEED_KIND_LABELS,
  PLAYBOOK_SEED_KINDS,
  isPlaybookSeedKind,
  type PlaybookSeedKind,
} from "@watchdog/schemas/shared";

export const PLAYBOOK_SEED_FILTERS = [
  { value: "", label: "All seeds" },
  ...PLAYBOOK_SEED_KINDS.map((kind) => ({
    value: kind,
    label: PLAYBOOK_SEED_KIND_LABELS[kind],
  })),
] as const;

/** "All egress", then one option per egress class: the Playbooks that need that class. */
export const PLAYBOOK_EGRESS_FILTERS = [
  { value: "", label: "All egress" },
  ...EGRESS_CLASSES.map((c) => ({ value: c, label: egressClassLabel(c) })),
] as const;

export type PlaybookMatchFilters = {
  seedFilter: string;
  egressFilter: string;
  isKeyOnlyNeeded: boolean;
  isUrlDumpOnly: boolean;
};

export function playbookPrimarySeed(
  playbook: PlaybookListItem
): PlaybookSeedKind | undefined {
  return playbook.seedKinds[0];
}

export function playbookRequiresKey(playbook: PlaybookListItem): boolean {
  for (const spec of playbook.requires.credentials) {
    if ("anyOf" in spec) return true;
    if (spec.optional !== true) return true;
  }
  return false;
}

export function playbookPickUrlDump(playbook: PlaybookListItem): boolean {
  return playbookSeedRequirements(playbook).shouldPickUrlDump;
}

function playbookMatchesFilters(
  playbook: PlaybookListItem,
  filters: PlaybookMatchFilters
): boolean {
  if (
    filters.seedFilter !== "" &&
    (!isPlaybookSeedKind(filters.seedFilter) ||
      !playbook.seedKinds.includes(filters.seedFilter))
  ) {
    return false;
  }
  if (
    filters.egressFilter !== "" &&
    !playbook.requires.egress.some((c) => c === filters.egressFilter)
  ) {
    return false;
  }
  if (filters.isKeyOnlyNeeded && !playbookRequiresKey(playbook)) return false;
  if (filters.isUrlDumpOnly && !playbookPickUrlDump(playbook)) return false;
  return true;
}

/** Filter playbooks for the Jobs / Collect playbook launcher. */
export function matchPlaybooks(
  playbooks: readonly PlaybookListItem[],
  filters: PlaybookMatchFilters
): PlaybookListItem[] {
  return playbooks.filter((playbook) =>
    playbookMatchesFilters(playbook, filters)
  );
}

/** Seed facets present in the catalog. */
export function playbookSeedFilterOptions(
  playbooks: readonly PlaybookListItem[]
): { value: string; label: string }[] {
  const seeds = new Set<PlaybookSeedKind>();
  for (const playbook of playbooks) {
    for (const kind of playbook.seedKinds) {
      seeds.add(kind);
    }
  }
  return [
    { value: "", label: "All seeds" },
    ...[...seeds]
      .sort((a, b) =>
        PLAYBOOK_SEED_KIND_LABELS[a].localeCompare(PLAYBOOK_SEED_KIND_LABELS[b])
      )
      .map((kind) => ({
        value: kind,
        label: PLAYBOOK_SEED_KIND_LABELS[kind],
      })),
  ];
}

export function playbookSeedFilterLabel(value: string): string {
  if (value === "") return "All seeds";
  return isPlaybookSeedKind(value) ? PLAYBOOK_SEED_KIND_LABELS[value] : value;
}

export function playbookEgressFilterLabel(value: string): string {
  return (
    PLAYBOOK_EGRESS_FILTERS.find((opt) => opt.value === value)?.label ?? value
  );
}
