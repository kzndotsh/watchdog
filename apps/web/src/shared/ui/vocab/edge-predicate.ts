import type { EntityOption } from "@/shared/ui/entity-combobox";
import {
  EDGE_PREDICATES,
  EDGE_PREDICATE_GROUPS,
  EDGE_PREDICATE_GROUP_LABELS,
  EDGE_PREDICATE_META,
  edgePhraseValue,
  edgePredicateAllowsKinds,
  isEdgePredicate,
  parseEdgePhraseValue,
  predicateLabel as schemaPredicateLabel,
  type EdgeDirection,
  type EdgeOrientation,
  type EdgePredicate,
  type EntityKind,
} from "@watchdog/schemas";

import { titleCase } from "./title-case";

export {
  EDGE_PREDICATE_META,
  edgePhraseValue,
  parseEdgePhraseValue,
  type EdgeDirection,
  type EdgeOrientation,
};

/** Direction-aware display; unknown strings title-cased. */
export function predicateLabel(
  predicate: string,
  direction: EdgeDirection = "out"
): string {
  if (isEdgePredicate(predicate)) {
    return schemaPredicateLabel(predicate, direction);
  }
  return titleCase(predicate);
}

export interface EdgePhraseOption {
  /** Stable option id: `${predicate}:${orientation}` */
  value: string;
  label: string;
  /** Semantic Combobox group heading. */
  group: string;
  predicate: EdgePredicate;
  /** forward = current entity is subject; inverse = current entity is object */
  orientation: EdgeOrientation;
}

function allowsPair(
  predicate: EdgePredicate,
  fromKind: EntityKind | undefined,
  toKind: EntityKind | undefined
): boolean {
  if (fromKind === undefined || toKind === undefined) return true;
  return edgePredicateAllowsKinds(predicate, fromKind, toKind);
}

/** Whether a peer kind is valid for the center entity + selected phrase. */
export function peerKindAllowedForPhrase(
  centerKind: EntityKind,
  peerKind: EntityKind,
  predicate: EdgePredicate,
  orientation: EdgeOrientation
): boolean {
  if (orientation === "forward") {
    return edgePredicateAllowsKinds(predicate, centerKind, peerKind);
  }
  return edgePredicateAllowsKinds(predicate, peerKind, centerKind);
}

export function filterPeerOptionsForPhrase(
  centerKind: EntityKind,
  peerOptions: readonly EntityOption[],
  phraseValue: string
): EntityOption[] {
  const parsed = parseEdgePhraseValue(phraseValue);
  if (!parsed) return [...peerOptions];
  return peerOptions.filter(
    (peer) =>
      peer.kind !== undefined &&
      peerKindAllowedForPhrase(
        centerKind,
        peer.kind,
        parsed.predicate,
        parsed.orientation
      )
  );
}

const GROUP_RANK = new Map(
  EDGE_PREDICATE_GROUPS.map((g, i) => [g, i] as const)
);

function sortEdgePhraseOptions(out: EdgePhraseOption[]): EdgePhraseOption[] {
  out.sort((a, b) => {
    const ga = GROUP_RANK.get(EDGE_PREDICATE_META[a.predicate].group) ?? 0;
    const gb = GROUP_RANK.get(EDGE_PREDICATE_META[b.predicate].group) ?? 0;
    if (ga !== gb) return ga - gb;
    return (
      EDGE_PREDICATES.indexOf(a.predicate) -
      EDGE_PREDICATES.indexOf(b.predicate)
    );
  });
  return out;
}

/**
 * Combined phrase options for create framing.
 * Symmetric predicates appear once (forward only).
 * Ordered by semantic group, then predicate enum order.
 */
export function edgePhraseOptions(opts?: {
  fromKind?: EntityKind;
  toKind?: EntityKind;
}): EdgePhraseOption[] {
  const fromKind = opts?.fromKind;
  const toKind = opts?.toKind;
  const out: EdgePhraseOption[] = [];

  for (const predicate of EDGE_PREDICATES) {
    const meta = EDGE_PREDICATE_META[predicate];
    const groupLabel = EDGE_PREDICATE_GROUP_LABELS[meta.group];

    // Infra topology only: dependent is always an infra entity in the picker.
    if (
      predicate === "hosted_on" &&
      fromKind !== undefined &&
      fromKind !== "infra"
    ) {
      continue;
    }

    if (allowsPair(predicate, fromKind, toKind)) {
      out.push({
        value: edgePhraseValue(predicate, "forward"),
        label: meta.label,
        group: groupLabel,
        predicate,
        orientation: "forward",
      });
    }

    if (meta.symmetric) continue;

    const forwardCanonical =
      fromKind !== undefined &&
      toKind !== undefined &&
      allowsPair(predicate, fromKind, toKind);
    const inverseCanonical =
      fromKind !== undefined &&
      toKind !== undefined &&
      allowsPair(predicate, toKind, fromKind);
    const skipInversePreferForward =
      forwardCanonical && inverseCanonical && fromKind !== toKind;

    if (inverseCanonical && !skipInversePreferForward) {
      out.push({
        value: edgePhraseValue(predicate, "inverse"),
        label: meta.inverseLabel,
        group: groupLabel,
        predicate,
        orientation: "inverse",
      });
    }
  }

  return sortEdgePhraseOptions(out);
}

/**
 * Relationship options for a center entity and case peers.
 * With a selected peer kind, narrows to that pair; otherwise unions phrases
 * valid for at least one available peer kind (not the unfiltered center-only list).
 */
export function edgePhraseOptionsForPeers(
  centerKind: EntityKind,
  peerOptions: readonly EntityOption[],
  selectedPeerKind?: EntityKind
): EdgePhraseOption[] {
  if (selectedPeerKind !== undefined) {
    return edgePhraseOptions({
      fromKind: centerKind,
      toKind: selectedPeerKind,
    });
  }

  const peerKinds = new Set<EntityKind>();
  for (const peer of peerOptions) {
    if (peer.kind !== undefined) peerKinds.add(peer.kind);
  }

  const seen = new Set<string>();
  const out: EdgePhraseOption[] = [];

  for (const peerKind of peerKinds) {
    for (const phrase of edgePhraseOptions({
      fromKind: centerKind,
      toKind: peerKind,
    })) {
      if (seen.has(phrase.value)) continue;
      seen.add(phrase.value);
      out.push(phrase);
    }
  }

  return sortEdgePhraseOptions(out);
}

type PreferredPair = readonly [EdgePredicate, EdgeOrientation];

const PREFERRED_BY_KIND_PAIR: Partial<
  Record<`${EntityKind}:${EntityKind}`, PreferredPair>
> = {
  "org:infra": ["primary_domain", "forward"],
  "infra:org": ["primary_domain", "inverse"],
  "org:org": ["parent_of", "forward"],
  "infra:infra": ["parent_of", "forward"],
};

/**
 * Kind-pair smart default for connection pickers.
 * Falls back to the first valid `edgePhraseOptions` entry.
 */
export function preferredEdgePhrase(
  centerKind: EntityKind,
  peerKind: EntityKind
): EdgePhraseOption | null {
  const options = edgePhraseOptions({
    fromKind: centerKind,
    toKind: peerKind,
  });
  if (options.length === 0) return null;

  const preferred = PREFERRED_BY_KIND_PAIR[`${centerKind}:${peerKind}`];
  if (preferred) {
    const value = edgePhraseValue(preferred[0], preferred[1]);
    const hit = options.find((o) => o.value === value);
    if (hit) return hit;
  }
  return options[0] ?? null;
}

/**
 * Keep current phrase if still valid for the kind pair; else preferred (then first).
 */
export function clampEdgePhrase(
  centerKind: EntityKind,
  peerKind: EntityKind,
  predicate: EdgePredicate,
  orientation: EdgeOrientation
): { predicate: EdgePredicate; orientation: EdgeOrientation } {
  const options = edgePhraseOptions({
    fromKind: centerKind,
    toKind: peerKind,
  });
  const current = edgePhraseValue(predicate, orientation);
  if (options.some((o) => o.value === current)) {
    return { predicate, orientation };
  }
  const preferred = preferredEdgePhrase(centerKind, peerKind);
  if (preferred) {
    return {
      predicate: preferred.predicate,
      orientation: preferred.orientation,
    };
  }
  return { predicate, orientation };
}
