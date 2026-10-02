import { testId } from "@watchdog/test-kit/fixtures";

import type { JsonObject } from "../json";
import type { PatchOp } from "../patch";

export function buildPatchOp(
  overrides: Partial<PatchOp> & Pick<PatchOp, "resource">
): PatchOp {
  return {
    op: "create",
    id: testId(3),
    data: {},
    ...overrides,
  };
}

export function buildClaimCreateOp(
  entityId: string,
  text: string,
  overrides?: Partial<PatchOp>
): PatchOp {
  return {
    op: "create",
    resource: "claim",
    id: testId(3),
    data: {
      entityId,
      text,
      class: "observation",
    },
    ...overrides,
  };
}

export function buildIdentifierCreateOp(
  entityId: string,
  type: string,
  value: string,
  overrides?: Partial<PatchOp>
): PatchOp {
  const data: JsonObject = {
    entityId,
    type,
    value,
    ...overrides?.data,
  };
  return {
    op: "create",
    resource: "identifier",
    id: testId(4),
    ...overrides,
    data,
  };
}

export function buildEntityCreateOp(
  name: string,
  slug: string,
  kind = "person",
  overrides?: Partial<PatchOp>
): PatchOp {
  return {
    op: "create",
    resource: "entity",
    id: testId(5),
    data: { name, slug, kind },
    ...overrides,
  };
}

export function buildEventCreateOp(
  entityId: string,
  when: string,
  what: string,
  overrides?: Partial<PatchOp>
): PatchOp {
  return {
    op: "create",
    resource: "event",
    id: testId(6),
    data: { entityId, when, what },
    ...overrides,
  };
}

export function buildQuestionCreateOp(
  entityId: string,
  text: string,
  overrides?: Partial<PatchOp>
): PatchOp {
  return {
    op: "create",
    resource: "question",
    id: testId(7),
    data: { entityId, text },
    ...overrides,
  };
}

export function buildEdgeCreateOp(
  fromId: string,
  toId: string,
  predicate: string,
  overrides?: Partial<PatchOp>
): PatchOp {
  const data: JsonObject = {
    fromId,
    toId,
    predicate,
    ...overrides?.data,
  };
  return {
    op: "create",
    resource: "edge",
    id: testId(8),
    ...overrides,
    data,
  };
}
