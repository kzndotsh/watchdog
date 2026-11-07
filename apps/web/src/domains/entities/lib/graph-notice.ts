import type { CaseCounts } from "@/domains/cases/types";
import type { GraphSnapshot } from "@/domains/entities/edges/types";
import { compactCountLabel, fullCountLabel } from "@/shared/lib/list/list-copy";
import type { ListCountValue } from "@/shared/lib/list/list-types";
import type { ListTotal } from "@watchdog/schemas/shared";

const REST_HINT = "Open an Entity's Connections to see the rest.";

function countOf(loaded: number, total: ListTotal): ListCountValue {
  return { loaded, total, hasMore: true, isAtCeiling: false, isSettled: true };
}

/**
 * What the Graph page says when the server cut its snapshot (#570): "Showing 150 of 250
 * entities, the most connected." with M from the Case's counts, or the Connections when only they
 * were cut. Null when nothing was left out. Without the counts (still loading, or failed) it
 * names the drawn Entities only.
 */
export function graphTruncationNotice(
  snapshot: Pick<GraphSnapshot, "entities" | "edges" | "isTruncated">,
  counts: Pick<CaseCounts, "entities" | "connections"> | undefined
): string | null {
  if (!snapshot.isTruncated) return null;
  const drawn = snapshot.entities.length;
  if (counts === undefined) {
    const n = compactCountLabel(
      countOf(drawn, { count: drawn, isCapped: false })
    );
    return `Showing the ${n} most connected entities. ${REST_HINT}`;
  }
  const { entities, connections } = counts;
  if (entities.isCapped || entities.count > drawn) {
    return `${fullCountLabel(countOf(drawn, entities))} entities, the most connected. ${REST_HINT}`;
  }
  return `${fullCountLabel(countOf(snapshot.edges.length, connections))} connections. ${REST_HINT}`;
}

const EGO_REST_HINT = "The list beside it has them all.";

/**
 * What the Dossier ego graph says when the server cut it (#585): "Showing 60 of 2,400
 * connections, the most recently updated." with M from the Connections tab's own count (the
 * list's first-page total, already read for the tab), or the drawn count alone while it is
 * unknown. Null when nothing was left out.
 */
export function egoTruncationNotice(
  ego: { readonly edges: readonly unknown[]; readonly isTruncated: boolean },
  total: ListTotal | null
): string | null {
  if (!ego.isTruncated) return null;
  const drawn = ego.edges.length;
  if (total === null) {
    return `Showing the ${String(drawn)} most recently updated connections. ${EGO_REST_HINT}`;
  }
  return `${fullCountLabel(countOf(drawn, total))} connections, the most recently updated. ${EGO_REST_HINT}`;
}
