import type { CapProviderInfo } from "@/domains/jobs/types";
import {
  PROVIDER_TIER_LABELS,
  type CapDetailView,
} from "@/domains/library/lib/cap-detail";
import { inputKindLabel } from "@/domains/library/lib/input-kinds";
import type { LibraryEntry } from "@/domains/library/types";

/** One cell of the facts strip under the header. */
export type LibraryEntryFact = { caption: string; value: string };

/** Where the viewer's input goes. */
export function dataLabel(entry: Pick<LibraryEntry, "isThirdParty">): string {
  return entry.isThirdParty ? "Sent out" : "Stays here";
}

function listOrNothing(labels: readonly string[]): string {
  return labels.length === 0 ? "Nothing" : labels.join(", ");
}

/** The Cap's facts strip: what it takes and returns, where data goes, plan, keys, timeout. */
export function capFacts(
  entry: Pick<LibraryEntry, "isThirdParty">,
  view: Pick<
    CapDetailView,
    "consumes" | "produces" | "credentials" | "timeout"
  >,
  tier: CapProviderInfo["tier"]
): LibraryEntryFact[] {
  const keyCount = view.credentials.length;
  return [
    {
      caption: "Takes",
      value: listOrNothing(view.consumes.map((chip) => chip.label)),
    },
    {
      caption: "Returns",
      value: listOrNothing(view.produces.map((chip) => chip.label)),
    },
    { caption: "Data", value: dataLabel(entry) },
    { caption: "Plan", value: PROVIDER_TIER_LABELS[tier] },
    { caption: "Keys", value: keyCount === 0 ? "None" : String(keyCount) },
    { caption: "Timeout", value: view.timeout ?? "Default" },
  ];
}

/** The Playbook's facts strip: size, seed kinds, providers, keys needed, data. */
export function playbookFacts(
  entry: Pick<
    LibraryEntry,
    "steps" | "inputKinds" | "providers" | "isThirdParty"
  >
): LibraryEntryFact[] {
  const keysNeeded = entry.steps.filter(
    (step) => step.readiness.state === "needs_key"
  ).length;
  return [
    { caption: "Steps", value: String(entry.steps.length) },
    {
      caption: "Starts from",
      value: listOrNothing(entry.inputKinds.map(inputKindLabel)),
    },
    { caption: "Providers", value: String(entry.providers.length) },
    { caption: "Keys needed", value: String(keysNeeded) },
    { caption: "Data", value: dataLabel(entry) },
  ];
}
