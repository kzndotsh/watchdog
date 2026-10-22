import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import { buildLibraryEntries } from "@/domains/library/lib/library-entries";
import { credentialsListQuery } from "@/domains/settings/queries";
import { couldnt } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";

const EMPTY_CAPS: CapListItem[] = [];
const EMPTY_PLAYBOOKS: PlaybookListItem[] = [];

/**
 * The Library's data: the same catalog reads and vault slot list Collect's run picker uses,
 * so a viewer's readiness here is the one Collect would show. A vault that cannot be read
 * leaves the catalog visible with every keyed entry "Unavailable", never falsely "Ready", and
 * reports `keysError` so the Queue can offer a retry.
 */
export function useLibraryData() {
  const capsQuery = useQuery(capabilitiesListQuery());
  const playbooksQuery = useQuery(playbooksListQuery());
  const credentialsQuery = useQuery(credentialsListQuery());

  const caps = capsQuery.data ?? EMPTY_CAPS;
  const playbooks = playbooksQuery.data ?? EMPTY_PLAYBOOKS;
  const slots = credentialsQuery.data;

  const configured = useMemo(() => {
    if (slots === undefined) return null;
    return new Set(
      slots.filter((slot) => slot.configured).map((slot) => slot.name)
    );
  }, [slots]);

  const entries = useMemo(
    () => buildLibraryEntries({ caps, playbooks, configured }),
    [caps, playbooks, configured]
  );

  const isPending =
    listPending(capsQuery) ||
    listPending(playbooksQuery) ||
    listPending(credentialsQuery);
  const loadError = combinedQueryLoadError(
    [capsQuery, playbooksQuery],
    isPending,
    couldnt("load", "the Library")
  );

  const keysError =
    credentialsQuery.isError && slots === undefined
      ? couldnt("check", "your keys")
      : null;

  return {
    entries,
    isPending,
    keysError,
    isPlaceholder:
      capsQuery.isPlaceholderData || playbooksQuery.isPlaceholderData,
    loadError,
    retry: () => {
      if (capsQuery.isError) void capsQuery.refetch();
      if (playbooksQuery.isError) void playbooksQuery.refetch();
      if (credentialsQuery.isError) void credentialsQuery.refetch();
    },
  };
}
