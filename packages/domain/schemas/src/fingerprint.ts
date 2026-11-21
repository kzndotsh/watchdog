import { normalizeIdentifierValue } from "./normalize-identifier";
import { type PatchOp, type PatchResource, patchOpResource } from "./patch";
import { normalizeIdentifierPlatform } from "./platforms";
import { slugifyName } from "./primitives";
import {
  EDGE_PREDICATE_META,
  EDGE_PREDICATES,
  type EdgePredicate,
} from "./vocab";

type OpFields = Readonly<Record<string, unknown>>;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function fingerprintIdentifierOp(d: OpFields): string | null {
  const entityId = str(d.entityId);
  const type = str(d.type)?.toLowerCase();
  const valueRaw = str(d.value);
  if (entityId === undefined || type === undefined || valueRaw === undefined) {
    return null;
  }
  const platform = normalizeIdentifierPlatform(str(d.platform) ?? "");
  const value = normalizeIdentifierValue(type, valueRaw);
  return `identifier|${entityId}|${type}|${platform}|${value}`;
}

function fingerprintClaimOp(d: OpFields): string | null {
  const entityId = str(d.entityId);
  const text = str(d.text)?.toLowerCase();
  if (entityId === undefined || text === undefined) return null;
  return `claim|${entityId}|${text}`;
}

function isEdgePredicate(value: string): value is EdgePredicate {
  return (EDGE_PREDICATES as readonly string[]).includes(value);
}

function canonicalEdgeEndpoints(
  fromId: string,
  toId: string,
  predicate: EdgePredicate
): [string, string] {
  if (!EDGE_PREDICATE_META[predicate].symmetric) {
    return [fromId, toId];
  }
  return fromId < toId ? [fromId, toId] : [toId, fromId];
}

/** Shared edge key for reject memory and graph duplicate detection. */
export function edgePatchFingerprintKey(input: {
  fromId: string;
  toId: string;
  predicate: string;
  notes?: unknown;
}): string | null {
  const predicateRaw = str(input.predicate);
  if (predicateRaw === undefined) return null;
  const predicate = predicateRaw.toLowerCase();
  if (!isEdgePredicate(predicate)) {
    return null;
  }
  const fromId = str(input.fromId);
  const toId = str(input.toId);
  if (fromId === undefined || toId === undefined) {
    return null;
  }
  const [a, b] = canonicalEdgeEndpoints(fromId, toId, predicate);
  if (predicate === "related_to") {
    const notes = str(input.notes)?.toLowerCase();
    if (notes === undefined) return null;
    return `edge|${a}|${b}|${predicate}|${notes}`;
  }
  return `edge|${a}|${b}|${predicate}`;
}

function fingerprintEdgeOp(d: OpFields): string | null {
  const fromId = str(d.fromId);
  const toId = str(d.toId);
  const predicate = str(d.predicate);
  if (fromId === undefined || toId === undefined || predicate === undefined) {
    return null;
  }
  return edgePatchFingerprintKey({
    fromId,
    toId,
    predicate,
    notes: d.notes,
  });
}

function fingerprintQuestionOp(d: OpFields): string | null {
  const entityId = str(d.entityId);
  const text = str(d.text)?.toLowerCase();
  if (entityId === undefined || text === undefined) return null;
  return `question|${entityId}|${text}`;
}

function fingerprintEventOp(d: OpFields): string | null {
  const entityId = str(d.entityId);
  const when = str(d.when)?.toLowerCase();
  const what = str(d.what)?.toLowerCase();
  if (entityId === undefined || when === undefined || what === undefined) {
    return null;
  }
  return `event|${entityId}|${when}|${what}`;
}

function fingerprintEntityOp(d: OpFields): string | null {
  const raw = str(d.slug);
  if (raw === undefined) return null;
  const slug = slugifyName(raw);
  if (slug === "") return null;
  return `entity|${slug}`;
}

const FINGERPRINT_BY_RESOURCE: Record<
  PatchResource,
  (d: OpFields) => string | null
> = {
  identifier: fingerprintIdentifierOp,
  claim: fingerprintClaimOp,
  edge: fingerprintEdgeOp,
  question: fingerprintQuestionOp,
  event: fingerprintEventOp,
  entity: fingerprintEntityOp,
};

/**
 * Deterministic fingerprint for a PatchOp — used for known-finding
 * suppression and rejected-FP memory.
 */
export function fingerprintPatchOp(op: PatchOp): string | null {
  const fields: OpFields = op.data;
  return FINGERPRINT_BY_RESOURCE[patchOpResource(op)](fields);
}
