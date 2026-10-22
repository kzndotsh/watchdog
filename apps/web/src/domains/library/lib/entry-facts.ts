import type { CapDetailView } from "@/domains/library/lib/cap-detail";
import { inputKindLabel } from "@/domains/library/lib/input-kinds";
import type { LibraryEntry } from "@/domains/library/types";

/** One cell of the facts strip. A wide fact (a list of kinds) takes more of the row than a short one. */
export type LibraryEntryFact = {
  caption: string;
  value: string;
  isWide?: boolean;
};

/** Where the viewer's input goes. */
export function dataLabel(entry: Pick<LibraryEntry, "isThirdParty">): string {
  return entry.isThirdParty ? "Sent out" : "Stays here";
}

function listOrNothing(labels: readonly string[]): string {
  return labels.length === 0 ? "Nothing" : labels.join(", ");
}

/** The Cap's facts strip: what it takes and returns, where data goes, and how many keys it reads. Plan and timeout live in the aside and under Behaviour. */
export function capFacts(
  entry: Pick<LibraryEntry, "isThirdParty">,
  view: Pick<CapDetailView, "consumes" | "produces" | "credentials">
): LibraryEntryFact[] {
  const keyCount = view.credentials.length;
  return [
    {
      caption: "Takes",
      isWide: true,
      value: listOrNothing(view.consumes.map((chip) => chip.label)),
    },
    {
      caption: "Returns",
      isWide: true,
      value: listOrNothing(view.produces.map((chip) => chip.label)),
    },
    { caption: "Data", value: dataLabel(entry) },
    { caption: "Keys", value: keyCount === 0 ? "None" : String(keyCount) },
  ];
}

/** The Playbook's facts strip: size, seed kinds, providers, steps missing a key, data. */
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
      isWide: true,
      value: listOrNothing(entry.inputKinds.map(inputKindLabel)),
    },
    { caption: "Providers", value: String(entry.providers.length) },
    { caption: "Steps missing a key", value: String(keysNeeded) },
    { caption: "Data", value: dataLabel(entry) },
  ];
}
