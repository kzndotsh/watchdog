import { testId } from "#test-kit/fixtures";

import type { PatchOp, PatchOpKind } from "../patch";
import type { EdgePredicate, EntityKind, IdentifierType } from "../vocab";

/** The op of one kind (`OpOfKind<"claim.create">`). */
export type OpOfKind<K extends PatchOpKind> = Extract<PatchOp, { kind: K }>;

/** What a test changes on a built op: any envelope field, and some of its data. */
export type OpOverrides<K extends PatchOpKind> = Partial<
  Omit<OpOfKind<K>, "kind" | "data">
> & { data?: Partial<OpOfKind<K>["data"]> };

export function buildClaimCreateOp(
  entityId: string,
  text: string,
  overrides: OpOverrides<"claim.create"> = {}
): OpOfKind<"claim.create"> {
  const { data, ...envelope } = overrides;
  return {
    kind: "claim.create",
    id: testId(3),
    ...envelope,
    data: { entityId, text, class: "observation", ...data },
  };
}

export function buildIdentifierCreateOp(
  entityId: string,
  type: IdentifierType,
  value: string,
  overrides: OpOverrides<"identifier.create"> = {}
): OpOfKind<"identifier.create"> {
  const { data, ...envelope } = overrides;
  return {
    kind: "identifier.create",
    id: testId(4),
    ...envelope,
    data: { entityId, type, value, ...data },
  };
}

export function buildEntityCreateOp(
  name: string,
  slug: string,
  kind: EntityKind = "person",
  overrides: OpOverrides<"entity.create"> = {}
): OpOfKind<"entity.create"> {
  const { data, ...envelope } = overrides;
  return {
    kind: "entity.create",
    id: testId(5),
    ...envelope,
    data: { name, slug, kind, ...data },
  };
}

export function buildEventCreateOp(
  entityId: string,
  when: string,
  what: string,
  overrides: OpOverrides<"event.create"> = {}
): OpOfKind<"event.create"> {
  const { data, ...envelope } = overrides;
  return {
    kind: "event.create",
    id: testId(6),
    ...envelope,
    data: { entityId, when, what, ...data },
  };
}

export function buildQuestionCreateOp(
  entityId: string,
  text: string,
  overrides: OpOverrides<"question.create"> = {}
): OpOfKind<"question.create"> {
  const { data, ...envelope } = overrides;
  return {
    kind: "question.create",
    id: testId(7),
    ...envelope,
    data: { entityId, text, ...data },
  };
}

export function buildEdgeCreateOp(
  fromId: string,
  toId: string,
  predicate: EdgePredicate,
  overrides: OpOverrides<"edge.create"> = {}
): OpOfKind<"edge.create"> {
  const { data, ...envelope } = overrides;
  return {
    kind: "edge.create",
    id: testId(8),
    ...envelope,
    data: { fromId, toId, predicate, ...data },
  };
}
