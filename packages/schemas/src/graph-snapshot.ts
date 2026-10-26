/**
 * The Graph snapshot's caps (#570). The Graph page draws at most this many Entities: the Case's
 * most connected (by Connection count, then most recently updated). The layout stays readable and
 * fast up to here; past it the page says "showing N of M".
 */
export const GRAPH_SNAPSHOT_ENTITY_MAX = 150;

/**
 * At most this many Connections between the kept Entities, most recently updated first. Four per
 * drawn Entity on average; a denser Case is cut and `isTruncated` says so.
 */
export const GRAPH_SNAPSHOT_EDGE_MAX = 600;

/**
 * The Dossier ego graph's cap (#585): at most this many of the Entity's Connections, most
 * recently updated first, so a hub draws a readable star instead of every Connection it has. The
 * Connections list beside it pages through them all.
 */
export const GRAPH_EGO_EDGE_MAX = 60;
