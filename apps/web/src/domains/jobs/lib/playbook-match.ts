import { playbookSeedRequirements } from "@/domains/jobs/lib/playbook-seed-requirements";
import type { PlaybookListItem } from "@/domains/jobs/types";
import type { PlaybookSeedKind } from "@watchdog/schemas";

const SEED_KIND_LABELS: Record<PlaybookSeedKind, string> = {
  host: "Host",
  url: "URL",
  evidence: "Evidence",
  ip: "IP",
  email: "Email",
  hash: "Hash",
  handle: "Handle",
};

function isPlaybookSeedKind(value: string): value is PlaybookSeedKind {
  return Object.hasOwn(SEED_KIND_LABELS, value);
}

export const PLAYBOOK_SEED_FILTERS = [
  { value: "", label: "All seeds" },
  ...(
    [
      "host",
      "url",
      "evidence",
      "ip",
      "email",
      "hash",
      "handle",
    ] as const satisfies readonly PlaybookSeedKind[]
  ).map((kind) => ({
    value: kind,
    label: SEED_KIND_LABELS[kind],
  })),
] as const;

export const PLAYBOOK_EGRESS_FILTERS = [
  { value: "", label: "All egress" },
  { value: "none", label: "None" },
  { value: "third_party", label: "Third party" },
] as const;

export interface PlaybookMatchFilters {
  seedFilter: string;
  egressFilter: string;
  needsKeyOnly: boolean;
  urlDumpOnly: boolean;
}

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
  return playbookSeedRequirements(playbook).pickUrlDump;
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
    (playbook.requires.egress ?? "none") !== filters.egressFilter
  ) {
    return false;
  }
  if (filters.needsKeyOnly && !playbookRequiresKey(playbook)) return false;
  if (filters.urlDumpOnly && !playbookPickUrlDump(playbook)) return false;
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
      .sort((a, b) => SEED_KIND_LABELS[a].localeCompare(SEED_KIND_LABELS[b]))
      .map((kind) => ({
        value: kind,
        label: SEED_KIND_LABELS[kind],
      })),
  ];
}

export function playbookSeedFilterLabel(value: string): string {
  if (value === "") return "All seeds";
  return isPlaybookSeedKind(value) ? SEED_KIND_LABELS[value] : value;
}

export function playbookEgressFilterLabel(value: string): string {
  return (
    PLAYBOOK_EGRESS_FILTERS.find((opt) => opt.value === value)?.label ?? value
  );
}
