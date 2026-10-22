import type { CapConsumeItem } from "@/domains/jobs/types";
import type { InputKindOption, LibraryEntry } from "@/domains/library/types";
import type { PlaybookSeedKind } from "@watchdog/schemas/shared";

/** The kinds an investigator names first; any other kind follows alphabetically. */
const INPUT_KIND_ORDER: readonly string[] = [
  "email",
  "username",
  "phone",
  "domain",
  "ip",
  "url",
  "hash",
  "file",
];

const INPUT_KIND_LABELS: Record<string, string> = {
  email: "Email address",
  username: "Username",
  phone: "Phone number",
  domain: "Domain",
  ip: "IP address",
  url: "URL",
  url_archive: "URL archive",
  hash: "File hash",
  file: "File",
  /** An identifier with no narrower type. */
  other: "Identifier",
};

export function inputKindLabel(kind: string): string {
  return (
    INPUT_KIND_LABELS[kind] ??
    `${kind.charAt(0).toUpperCase()}${kind.slice(1).replaceAll("_", " ")}`
  );
}

/** A Cap `consumes` entry as the one input kind an investigator would say. */
export function capInputKind(io: CapConsumeItem): string {
  switch (io.kind) {
    case "identifier": {
      return io.type === "handle" ? "username" : (io.type ?? "other");
    }
    case "host": {
      return "domain";
    }
    case "evidence": {
      return io.evidenceKind === undefined || io.evidenceKind === "file"
        ? "file"
        : io.evidenceKind;
    }
    default: {
      return io.kind;
    }
  }
}

/** A Playbook seed kind in the same vocabulary as {@link capInputKind}. */
export function playbookInputKind(seed: PlaybookSeedKind): string {
  switch (seed) {
    case "host": {
      return "domain";
    }
    case "handle": {
      return "username";
    }
    case "evidence": {
      return "file";
    }
    case "url":
    case "ip":
    case "email":
    case "hash": {
      return seed;
    }
    default: {
      const _exhaustive: never = seed;
      return _exhaustive;
    }
  }
}

function uniqueKinds(kinds: readonly string[]): string[] {
  return [...new Set(kinds)];
}

export function capInputKinds(
  consumes: readonly CapConsumeItem[] | undefined
): string[] {
  return uniqueKinds((consumes ?? []).map(capInputKind));
}

export function playbookInputKinds(
  seedKinds: readonly PlaybookSeedKind[]
): string[] {
  return uniqueKinds(seedKinds.map(playbookInputKind));
}

function kindRank(kind: string): number {
  const rank = INPUT_KIND_ORDER.indexOf(kind);
  return rank === -1 ? INPUT_KIND_ORDER.length : rank;
}

/** Input kind to the keys of every entry that takes it. */
export function buildInputKindIndex(
  entries: readonly Pick<LibraryEntry, "key" | "inputKinds">[]
): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const kind of entry.inputKinds) {
      const keys = index.get(kind) ?? new Set<string>();
      keys.add(entry.key);
      index.set(kind, keys);
    }
  }
  return index;
}

/** The "start from what you have" choices: every kind some entry takes, with its count. */
export function inputKindOptions(
  index: ReadonlyMap<string, ReadonlySet<string>>
): InputKindOption[] {
  return [...index]
    .map(([value, keys]) => ({
      value,
      label: inputKindLabel(value),
      count: keys.size,
    }))
    .sort(
      (a, b) =>
        kindRank(a.value) - kindRank(b.value) || a.value.localeCompare(b.value)
    );
}

/** The "start from what you have" quick picks: the kinds most entries take, ties by usual order. */
export function quickPickKinds(
  options: readonly InputKindOption[],
  limit: number
): InputKindOption[] {
  return [...options]
    .sort(
      (a, b) =>
        b.count - a.count ||
        kindRank(a.value) - kindRank(b.value) ||
        a.value.localeCompare(b.value)
    )
    .slice(0, limit);
}
