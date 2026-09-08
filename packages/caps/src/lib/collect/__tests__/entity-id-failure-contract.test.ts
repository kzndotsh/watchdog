import { describe, expect, it } from "vitest";

import { interpretProcessDraft } from "../../../evidence/lib/process-shared.ts";
import { interpretIdentifierBatches } from "../interpret-identifier-batches.ts";
import {
  INVALID_COLLECT_ENTITY_SUMMARY,
  resolveCollectEntityId,
} from "../resolve-collect-entity-id.ts";

/**
 * Collect vs Process invalid-entity contract (intentional asymmetry):
 * - Collect interpret returns `{ patch: [], summary }` — triage-friendly, no throw.
 * - Process interpret throws on invalid ctx ids — job failure surfaces in worker/UI.
 */
describe("entity id failure contract", () => {
  const evidenceId = "22222222-2222-4222-8222-222222222222";

  it("Collect returns INVALID_COLLECT_ENTITY_SUMMARY for malformed entityId", () => {
    const result = interpretIdentifierBatches({
      entityId: "not-a-uuid",
      batches: [{ type: "domain", values: ["example.com"] }],
      claimText: "x",
      noEntitySummary: "no Entity",
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe(INVALID_COLLECT_ENTITY_SUMMARY);
  });

  it("Process interpret throws for malformed entityId before patch mapping", () => {
    expect(() =>
      interpretProcessDraft(
        {
          identifiers: [{ type: "email", value: "a@b.co" }],
          claims: [],
          questions: [],
        },
        { input: { evidenceId, entityId: "not-a-uuid" } },
        { noEntity: "no entity", empty: "empty" }
      )
    ).toThrow(/valid entityId/);
  });

  it("resolveCollectEntityId matches the Collect summary gate", () => {
    expect(resolveCollectEntityId("not-a-uuid")).toBeNull();
    expect(resolveCollectEntityId(undefined)).toBeUndefined();
    expect(resolveCollectEntityId("   ")).toBeUndefined();
  });
});
