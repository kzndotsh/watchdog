import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import {
  buildCapDetailView,
  type CapDetailView,
} from "@/domains/library/lib/cap-detail";
import {
  capInputKinds,
  playbookInputKinds,
} from "@/domains/library/lib/input-kinds";

const EMPTY_CAPS: CapListItem[] = [];
const EMPTY_PLAYBOOKS: PlaybookListItem[] = [];

export type CapDetail = {
  cap: CapListItem;
  view: CapDetailView;
  /** False until the Playbook list has loaded: `view.playbooks` is empty then, not known empty. */
  hasPlaybooks: boolean;
};

/** One Cap's detail, from the catalog reads the Library's Queue already made. Null while it loads or if it is gone. */
export function useCapDetail(capId: string): CapDetail | null {
  const caps = useQuery(capabilitiesListQuery()).data ?? EMPTY_CAPS;
  const playbooksData = useQuery(playbooksListQuery()).data;
  const playbooks = playbooksData ?? EMPTY_PLAYBOOKS;
  const hasPlaybooks = playbooksData !== undefined;

  return useMemo(() => {
    const cap = caps.find((candidate) => candidate.id === capId);
    if (cap === undefined) return null;
    const takenKinds = new Set([
      ...caps.flatMap((c) => capInputKinds(c.consumes)),
      ...playbooks.flatMap((p) => playbookInputKinds(p.seedKinds)),
    ]);
    return {
      cap,
      view: buildCapDetailView(cap, playbooks, takenKinds),
      hasPlaybooks,
    };
  }, [caps, playbooks, hasPlaybooks, capId]);
}
