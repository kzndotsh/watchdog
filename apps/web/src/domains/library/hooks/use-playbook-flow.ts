import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import {
  catalogTakenKinds,
  kindChipsFor,
  playbookOutputKinds,
  type CapKindChip,
} from "@/domains/library/lib/cap-detail";
import type { LibraryEntry } from "@/domains/library/types";

export type PlaybookFlow = {
  /** The seed kinds the Playbook starts from. */
  gives: CapKindChip[];
  /** What its steps produce between them. */
  gets: CapKindChip[];
};

/** A Playbook's ends for the How it runs flow, from the catalog reads its page already made. */
export function usePlaybookFlow(
  entry: Pick<LibraryEntry, "inputKinds" | "steps">
): PlaybookFlow {
  const caps = useQuery(capabilitiesListQuery()).data;
  const playbooks = useQuery(playbooksListQuery()).data;
  return useMemo(() => {
    const takenKinds = catalogTakenKinds(caps ?? [], playbooks ?? []);
    return {
      gives: kindChipsFor(entry.inputKinds, takenKinds),
      gets: kindChipsFor(
        playbookOutputKinds(
          entry.steps.map((step) => step.capId),
          caps ?? []
        ),
        takenKinds
      ),
    };
  }, [caps, playbooks, entry.inputKinds, entry.steps]);
}
