import { describe, expect, it } from "vitest";

import {
  groupPatchOps,
  PATCH_GROUP_OPEN_MAX,
} from "@/domains/triage/lib/patch-op-groups";
import type { PatchOp } from "@watchdog/schemas/graph";
import type { IdentifierType } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit";

const ENTITY = testId(500);

function identifier(n: number, type: IdentifierType, value: string): PatchOp {
  return {
    id: testId(n),
    kind: "identifier.create",
    data: { entityId: ENTITY, type, value },
  };
}

function claim(n: number): PatchOp {
  return {
    id: testId(n),
    kind: "claim.create",
    data: { entityId: ENTITY, text: "CT for acme.test" },
  };
}

function domains(from: number, count: number): PatchOp[] {
  return Array.from({ length: count }, (_, i) =>
    identifier(from + i, "domain", `h${i}.acme.test`)
  );
}

describe("groupPatchOps", () => {
  it("groups Identifiers by type and other ops by resource, in first-seen order", () => {
    const groups = groupPatchOps(
      [
        identifier(1, "domain", "a.acme.test"),
        identifier(2, "ip", "192.0.2.1"),
        identifier(3, "domain", "b.acme.test"),
        claim(4),
      ],
      new Set()
    );
    expect(groups.map((g) => [g.label, g.ops.length])).toEqual([
      ["Domain Identifiers", 2],
      ["IP Identifiers", 1],
      ["Claim", 1],
    ]);
  });

  it("collapses a group bigger than the open limit, and keeps a small one open", () => {
    const groups = groupPatchOps(
      [...domains(1, PATCH_GROUP_OPEN_MAX + 1), claim(100)],
      new Set()
    );
    expect(groups.map((g) => g.isOpenByDefault)).toEqual([false, true]);
  });

  it("puts flagged ops first and opens their group however big it is", () => {
    const ops = domains(1, 20);
    const flaggedId = testId(15);
    const [group] = groupPatchOps(ops, new Set([flaggedId]));
    expect(group?.ops[0]?.id).toBe(flaggedId);
    expect(group?.ops).toHaveLength(20);
    expect(group?.flaggedCount).toBe(1);
    expect(group?.isOpenByDefault).toBe(true);
  });
});
