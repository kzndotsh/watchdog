import type {
  CapConsumeItem,
  CapListItem,
  CapProviderInfo,
  PlaybookListItem,
} from "@/domains/jobs/types";
import {
  capInputKind,
  inputKindLabel,
} from "@/domains/library/lib/input-kinds";
import type { CommercialUse } from "@/domains/library/types";

export const COMMERCIAL_USE_LABELS: Record<CommercialUse, string> = {
  allowed: "Allowed",
  restricted: "Restricted",
  forbidden: "Forbidden",
  unknown: "Unknown",
};

export const PROVIDER_TIER_LABELS: Record<CapProviderInfo["tier"], string> = {
  free: "Free",
  freemium: "Free tier, paid plans",
  paid: "Paid",
  self: "Runs on this server",
};

/** An input kind a Cap takes or makes, as a chip that opens "start from what you have". */
export type CapKindChip = {
  kind: string;
  label: string;
  /** Some Library entry takes this kind, so the filter has something to show. */
  isLinked: boolean;
};

export type CapCredentialLine = {
  /** The vault slot, or the slots of an "any of" group. */
  slots: string[];
  isOptional: boolean;
};

export type CapPlaybookLink = {
  id: string;
  title: string;
};

export type CapDetailView = {
  consumes: CapKindChip[];
  produces: CapKindChip[];
  /** "30 s"; null when the Cap sets no timeout of its own. */
  timeout: string | null;
  /** How long a repeat run reuses a result; null when results are not cached. */
  cache: string | null;
  /** The Cap's own risk flags (`slow`, `invasive`); egress and keys have their own lines. */
  flags: string[];
  privacy: string;
  credentials: CapCredentialLine[];
  playbooks: CapPlaybookLink[];
};

const SHOWN_FLAGS: ReadonlySet<string> = new Set(["slow", "invasive"]);

const UNITS: readonly (readonly [string, number])[] = [
  ["d", 86_400_000],
  ["h", 3_600_000],
  ["min", 60_000],
  ["s", 1000],
];

/** `90000` is "90 s", `3600000` is "1 h": the largest unit that divides it evenly. */
export function formatCapDuration(ms: number): string {
  for (const [unit, size] of UNITS) {
    if (ms >= size && ms % size === 0) return `${ms / size} ${unit}`;
  }
  return `${ms} ms`;
}

function kindChips(
  io: readonly CapConsumeItem[] | undefined,
  takenKinds: ReadonlySet<string>
): CapKindChip[] {
  const kinds = [...new Set((io ?? []).map(capInputKind))];
  return kinds.map((kind) => ({
    kind,
    label: inputKindLabel(kind),
    isLinked: takenKinds.has(kind),
  }));
}

/** "Your input is sent to Shodan", or where it stays. */
export function capPrivacyLine(
  cap: Pick<CapListItem, "egress" | "provider">
): string {
  return cap.egress === "third_party"
    ? `Your input is sent to ${cap.provider.name}.`
    : "Your input stays on this server.";
}

/**
 * The Cap detail's fields, all read from the Cap's descriptor and the Playbook catalog.
 * `takenKinds` is every input kind some Library entry takes (see `buildInputKindIndex`).
 */
export function buildCapDetailView(
  cap: CapListItem,
  playbooks: readonly PlaybookListItem[],
  takenKinds: ReadonlySet<string>
): CapDetailView {
  const ttl = cap.jobPolicy?.cacheTtlMs;
  return {
    consumes: kindChips(cap.consumes, takenKinds),
    produces: kindChips(cap.produces, takenKinds),
    timeout:
      cap.timeoutMs === undefined ? null : formatCapDuration(cap.timeoutMs),
    cache: ttl === undefined || ttl <= 0 ? null : formatCapDuration(ttl),
    flags: (cap.flags ?? []).filter((flag) => SHOWN_FLAGS.has(flag)),
    privacy: capPrivacyLine(cap),
    credentials: (cap.credentials ?? []).map((spec) =>
      "anyOf" in spec
        ? { slots: spec.anyOf, isOptional: false }
        : { slots: [spec.name], isOptional: spec.optional === true }
    ),
    playbooks: playbooks
      .filter((playbook) => playbook.steps.includes(cap.id))
      .map((playbook) => ({
        id: playbook.id,
        title: playbook.title,
      })),
  };
}
