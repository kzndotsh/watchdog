import {
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
} from "@/shared/ui/graph/graph-layout";
import { EDGE_PREDICATE_META, type EdgePredicate } from "@watchdog/schemas";

/** Clear gap between card edges on the same row. */
export const CASE_GRAPH_NODE_MARGIN_X = 72;
/** Clear gap between card edges on adjacent layers. */
export const CASE_GRAPH_NODE_MARGIN_Y = 96;

/** Top-left step between layers (node height + vertical margin). */
export const CASE_GRAPH_LAYER_GAP_Y =
  GRAPH_NODE_HEIGHT + CASE_GRAPH_NODE_MARGIN_Y;
/** Top-left step between siblings on one layer (node width + horizontal margin). */
export const CASE_GRAPH_NODE_GAP_X =
  GRAPH_NODE_WIDTH + CASE_GRAPH_NODE_MARGIN_X;

function isSymmetricPredicate(predicate: EdgePredicate): boolean {
  return EDGE_PREDICATE_META[predicate].symmetric;
}

/**
 * Assign vertical layers from stored edge direction.
 * Canonical A → B places B below A (higher Y): operates, owns, member_of, hosted_on, …
 * Symmetric predicates do not impose rank (same row).
 */
export function computeDirectedNodeRanks(
  nodeIds: readonly string[],
  edges: readonly {
    fromId: string;
    toId: string;
    predicate: EdgePredicate;
  }[]
): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const id of nodeIds) {
    ranks.set(id, 0);
  }

  const directed = edges.filter(
    (edge) => !isSymmetricPredicate(edge.predicate)
  );

  for (const _pass of nodeIds) {
    let changed = false;
    for (const edge of directed) {
      const fromRank = ranks.get(edge.fromId) ?? 0;
      const toRank = ranks.get(edge.toId) ?? 0;
      const nextRank = fromRank + 1;
      if (nextRank > toRank) {
        ranks.set(edge.toId, nextRank);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return ranks;
}

export function placeLayeredGraphNodes({
  nodeIds,
  ranks,
  nodeLabels,
}: {
  nodeIds: readonly string[];
  ranks: Map<string, number>;
  nodeLabels: Map<string, string>;
}): Map<string, { x: number; y: number }> {
  const byRank = new Map<number, string[]>();

  for (const id of nodeIds) {
    const rank = ranks.get(id) ?? 0;
    const layer = byRank.get(rank) ?? [];
    layer.push(id);
    byRank.set(rank, layer);
  }

  for (const layer of byRank.values()) {
    layer.sort((a, b) =>
      (nodeLabels.get(a) ?? a).localeCompare(nodeLabels.get(b) ?? b)
    );
  }

  const maxRank = Math.max(0, ...byRank.keys());
  const yOffset = -(maxRank * CASE_GRAPH_LAYER_GAP_Y) / 2;
  const positions = new Map<string, { x: number; y: number }>();

  for (const [rank, layer] of byRank) {
    const span = Math.max(0, layer.length - 1) * CASE_GRAPH_NODE_GAP_X;
    const startX = -span / 2;
    for (const [index, id] of layer.entries()) {
      positions.set(id, {
        x: startX + index * CASE_GRAPH_NODE_GAP_X,
        y: yOffset + rank * CASE_GRAPH_LAYER_GAP_Y,
      });
    }
  }

  return positions;
}
