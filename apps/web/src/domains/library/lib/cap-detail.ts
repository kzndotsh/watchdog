import type {
  CapConsumeItem,
  CapListItem,
  CapProviderInfo,
  PlaybookListItem,
} from "@/domains/jobs/types";
import {
  capInputKind,
  capInputKinds,
  inputKindLabel,
  playbookInputKinds,
} from "@/domains/library/lib/input-kinds";
import type { CommercialUse } from "@/domains/library/types";
import { egressDestinations } from "@watchdog/schemas/caps";

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
  stepCount: number;
};

/** One key a Cap reads, marked missing or configured for the viewer. */
/** A credential line's state from the vault: unknown when the vault could not be read. */
export type CapRequirementState = "configured" | "missing" | "unknown";

export type CapRequirement = CapCredentialLine & {
  state: CapRequirementState;
  /** "optional, missing": the muted words after the slot names. */
  status: string;
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

/** Input kinds as chips; a chip links to the Library's filter when some entry takes that kind. */
export function kindChipsFor(
  kinds: readonly string[],
  takenKinds: ReadonlySet<string>
): CapKindChip[] {
  return [...new Set(kinds)].map((kind) => ({
    kind,
    label: inputKindLabel(kind),
    isLinked: takenKinds.has(kind),
  }));
}

function kindChips(
  io: readonly CapConsumeItem[] | undefined,
  takenKinds: ReadonlySet<string>
): CapKindChip[] {
  return kindChipsFor((io ?? []).map(capInputKind), takenKinds);
}

/** Every input kind some Cap or Playbook in the catalog takes: the kinds the Library can filter by. */
export function catalogTakenKinds(
  caps: readonly CapListItem[],
  playbooks: readonly PlaybookListItem[]
): ReadonlySet<string> {
  return new Set([
    ...caps.flatMap((cap) => capInputKinds(cap.consumes)),
    ...playbooks.flatMap((playbook) => playbookInputKinds(playbook.seedKinds)),
  ]);
}

/** What a Playbook's steps produce between them, as input kinds (first step's kinds first). */
export function playbookOutputKinds(
  stepCapIds: readonly string[],
  caps: readonly CapListItem[]
): string[] {
  const byId = new Map(caps.map((cap) => [cap.id, cap]));
  return stepCapIds.flatMap((id) =>
    (byId.get(id)?.produces ?? []).map(capInputKind)
  );
}

/** "Your input is sent to api.shodan.io", or where it stays. Downloads of a fixed list carry no input. */
export function capPrivacyLine(cap: Pick<CapListItem, "contacts">): string {
  const sentTo = egressDestinations(
    cap.contacts.filter((c) => c.kind !== "download")
  );
  if (sentTo.length > 0) return `Your input is sent to ${sentTo.join(", ")}.`;
  if (cap.contacts.some((c) => c.kind === "download")) {
    return "Downloads a public list. Your input is not sent.";
  }
  return "Your input stays on this server.";
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
        stepCount: playbook.steps.length,
      })),
  };
}

/**
 * Each credential line's state, read from the vault's configured slots: a line is configured when
 * any of its slots is (an "any one of" group needs only one). `configured` is null when the vault
 * could not be read, and every line is then unknown. The run gate's missing list is not used: it
 * names only the first missing required key.
 */
export function buildCapRequirements(
  credentials: readonly CapCredentialLine[],
  configured: ReadonlySet<string> | null
): CapRequirement[] {
  return credentials.map((line) => {
    let state: CapRequirementState = "unknown";
    if (configured !== null) {
      state = line.slots.some((slot) => configured.has(slot))
        ? "configured"
        : "missing";
    }
    return {
      ...line,
      state,
      status: line.isOptional ? `optional, ${state}` : state,
    };
  });
}
