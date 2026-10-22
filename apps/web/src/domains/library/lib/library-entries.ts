import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import {
  capInputKinds,
  playbookInputKinds,
} from "@/domains/library/lib/input-kinds";
import {
  libraryReadiness,
  readinessRank,
} from "@/domains/library/lib/library-readiness";
import type {
  CommercialUse,
  LibraryEntry,
  LibraryGroup,
} from "@/domains/library/types";

const PLAYBOOK_CATEGORY = "playbook";

/** Least to most restrictive: a Playbook takes the strictest terms among its steps. */
const COMMERCIAL_STRICTNESS: readonly CommercialUse[] = [
  "allowed",
  "unknown",
  "restricted",
  "forbidden",
];

function categoryLabel(category: string): string {
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

/** A Cap's category is the first segment of its id (`network.dns.lookup` is Network). */
export function capCategory(capId: string): string {
  return capId.split(".")[0] ?? capId;
}

function strictest(values: readonly CommercialUse[]): CommercialUse {
  let rank = -1;
  for (const value of values) {
    rank = Math.max(rank, COMMERCIAL_STRICTNESS.indexOf(value));
  }
  return COMMERCIAL_STRICTNESS[rank] ?? "unknown";
}

export function entryKey(kind: LibraryEntry["kind"], id: string): string {
  return `${kind}:${id}`;
}

function capEntry(
  cap: CapListItem,
  configured: ReadonlySet<string> | null
): LibraryEntry {
  const category = capCategory(cap.id);
  return {
    key: entryKey("cap", cap.id),
    kind: "cap",
    id: cap.id,
    title: cap.title,
    description: cap.description ?? "",
    category,
    categoryLabel: categoryLabel(category),
    providers: [cap.provider.name],
    commercialUse: cap.provider.commercialUse,
    isThirdParty: cap.egress === "third_party",
    inputKinds: capInputKinds(cap.consumes),
    readiness: libraryReadiness(
      {
        disabledReason: cap.disabledReason,
        credentials: cap.credentials,
      },
      configured
    ),
  };
}

function playbookEntry(
  playbook: PlaybookListItem,
  capsById: ReadonlyMap<string, CapListItem>,
  configured: ReadonlySet<string> | null
): LibraryEntry {
  const stepCaps = playbook.steps.flatMap((id) => capsById.get(id) ?? []);
  return {
    key: entryKey("playbook", playbook.id),
    kind: "playbook",
    id: playbook.id,
    title: playbook.title,
    description: playbook.description,
    category: PLAYBOOK_CATEGORY,
    categoryLabel: "Playbooks",
    providers: [...new Set(stepCaps.map((cap) => cap.provider.name))],
    commercialUse: strictest(stepCaps.map((cap) => cap.provider.commercialUse)),
    isThirdParty: playbook.requires.egress === "third_party",
    inputKinds: playbookInputKinds(playbook.seedKinds),
    readiness: libraryReadiness(
      {
        disabledReason: playbook.disabledReason,
        credentials: playbook.requires.credentials,
      },
      configured
    ),
  };
}

/** Every Cap and Playbook as the viewer sees it. `configured` is null when the vault is unread. */
export function buildLibraryEntries(input: {
  caps: readonly CapListItem[];
  playbooks: readonly PlaybookListItem[];
  configured: ReadonlySet<string> | null;
}): LibraryEntry[] {
  const { caps, playbooks, configured } = input;
  const capsById = new Map(caps.map((cap) => [cap.id, cap]));
  return [
    ...playbooks.map((playbook) =>
      playbookEntry(playbook, capsById, configured)
    ),
    ...caps.map((cap) => capEntry(cap, configured)),
  ];
}

/** Ready first, then by how fixable the rest are, then by title. */
export function compareEntries(a: LibraryEntry, b: LibraryEntry): number {
  return (
    readinessRank(a.readiness) - readinessRank(b.readiness) ||
    a.title.localeCompare(b.title)
  );
}

/** Playbooks first, then each Cap category alphabetically; ready entries first inside each. */
export function groupLibraryEntries(
  entries: readonly LibraryEntry[]
): LibraryGroup[] {
  const groups = new Map<string, LibraryGroup>();
  for (const entry of [...entries].sort(compareEntries)) {
    const group = groups.get(entry.category) ?? {
      id: entry.category,
      label: entry.categoryLabel,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(entry.category, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.id === PLAYBOOK_CATEGORY) return -1;
    if (b.id === PLAYBOOK_CATEGORY) return 1;
    return a.label.localeCompare(b.label);
  });
}
