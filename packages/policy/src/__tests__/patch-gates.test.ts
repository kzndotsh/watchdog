import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import type { PatchOp } from "@watchdog/schemas";

import { assertPatchGates, assertPatchShape } from "../patch-gates.ts";

describe("patch-gates", () => {
  const entityId = "11111111-1111-4111-8111-111111111111";
  const evidenceId = "22222222-2222-4222-8222-222222222222";
  const opId = "33333333-3333-4333-8333-333333333333";

  function claimOp(overrides: Partial<PatchOp> = {}): PatchOp {
    return {
      op: "create",
      resource: "claim",
      id: opId,
      data: {
        entityId,
        text: "observed host",
        class: "observation",
      },
      ...overrides,
    };
  }

  function edgeOp(
    predicate: string,
    notes?: string,
    endpoints?: { fromId: string; toId: string }
  ): PatchOp {
    return {
      op: "create",
      resource: "edge",
      id: opId,
      data: {
        fromId: endpoints?.fromId ?? entityId,
        toId: endpoints?.toId ?? "44444444-4444-4444-8444-444444444444",
        predicate,
        ...(notes === undefined ? {} : { notes }),
      },
    };
  }

  function expectViolation(
    outcome: Result.Result<void, { readonly reason: string }>,
    pattern: RegExp
  ): void {
    expect(Result.isFailure(outcome)).toBe(true);
    if (Result.isFailure(outcome)) {
      expect(outcome.failure.reason).toMatch(pattern);
    }
  }

  it.effect(
    "assertPatchGates rejects confidence-gated patch without confidence",
    () =>
      Effect.gen(function* gatesRejectNoConfidence() {
        const outcome = yield* Effect.result(assertPatchGates([claimOp()]));
        expectViolation(outcome, /confidence is required/);
      })
  );

  it.effect("assertPatchGates accepts unverified with claim ops", () =>
    assertPatchGates([claimOp()], { confidence: "unverified" })
  );

  it.effect("assertPatchGates rejects confirmed with zero evidence", () =>
    Effect.gen(function* gatesRejectConfirmedNoEvidence() {
      const outcome = yield* Effect.result(
        assertPatchGates([claimOp()], {
          confidence: "confirmed",
        })
      );
      expectViolation(outcome, /confirmed requires at least one Evidence/);
    })
  );

  it.effect("assertPatchGates accepts confirmed via op evidenceIds", () =>
    assertPatchGates([claimOp({ evidenceIds: [evidenceId] })], {
      confidence: "confirmed",
    })
  );

  it.effect("assertPatchGates accepts confirmed via sharedEvidenceIds", () =>
    assertPatchGates([claimOp()], {
      confidence: "confirmed",
      sharedEvidenceIds: [evidenceId],
    })
  );

  it.effect(
    "assertPatchGates accepts confirmed via padded sharedEvidenceIds",
    () =>
      assertPatchGates([claimOp()], {
        confidence: "confirmed",
        sharedEvidenceIds: [`  ${evidenceId}  `],
      })
  );

  it.effect(
    "assertPatchGates rejects confirmed when op evidenceIds has invalid UUID",
    () =>
      Effect.gen(function* gatesRejectInvalidOpEvidence() {
        const outcome = yield* Effect.result(
          assertPatchGates([claimOp({ evidenceIds: ["not-a-uuid"] })], {
            confidence: "confirmed",
          })
        );
        expectViolation(outcome, /invalid UUID/);
      })
  );

  it.effect(
    "assertPatchGates rejects confirmed when sharedEvidenceIds has invalid UUID",
    () =>
      Effect.gen(function* gatesRejectInvalidSharedEvidence() {
        const outcome = yield* Effect.result(
          assertPatchGates([claimOp()], {
            confidence: "confirmed",
            sharedEvidenceIds: [evidenceId, "not-a-uuid"],
          })
        );
        expectViolation(outcome, /invalid UUID/);
      })
  );

  it.effect(
    "assertPatchGates rejects confirmed when shared evidence is whitespace only",
    () =>
      Effect.gen(function* gatesRejectWhitespaceSharedEvidence() {
        const outcome = yield* Effect.result(
          assertPatchGates([claimOp()], {
            confidence: "confirmed",
            sharedEvidenceIds: ["  ", ""],
          })
        );
        expectViolation(outcome, /confirmed requires at least one Evidence/);
      })
  );

  it.effect("assertPatchGates rejects unknown claim class", () =>
    Effect.gen(function* gatesRejectUnknownClass() {
      const outcome = yield* Effect.result(
        assertPatchGates(
          [
            claimOp({
              data: {
                entityId,
                text: "x",
                class: "not-a-class",
              },
            }),
          ],
          { confidence: "unverified" }
        )
      );
      expectViolation(outcome, /Invalid claim class/);
    })
  );

  it.effect("assertPatchGates rejects non-string claim class", () =>
    Effect.gen(function* gatesRejectNonStringClass() {
      const outcome = yield* Effect.result(
        assertPatchGates(
          [
            claimOp({
              data: {
                entityId,
                text: "x",
                class: 123,
              },
            }),
          ],
          { confidence: "unverified" }
        )
      );
      expectViolation(outcome, /class is required/);
    })
  );

  it.effect("assertPatchGates rejects unknown edge predicate", () =>
    Effect.gen(function* gatesRejectUnknownPredicate() {
      const outcome = yield* Effect.result(
        assertPatchGates([edgeOp("owns_everything")], {
          confidence: "unverified",
        })
      );
      expectViolation(outcome, /Invalid edge predicate/);
    })
  );

  it.effect("assertPatchGates rejects related_to without notes", () =>
    Effect.gen(function* gatesRejectRelatedToNoNotes() {
      const outcome = yield* Effect.result(
        assertPatchGates([edgeOp("related_to")], {
          confidence: "unverified",
        })
      );
      expectViolation(outcome, /related_to requires notes/);
    })
  );

  it.effect("assertPatchGates rejects self-linked edges", () =>
    Effect.gen(function* gatesRejectSelfLink() {
      const outcome = yield* Effect.result(
        assertPatchGates(
          [
            edgeOp("same_as", undefined, {
              fromId: entityId,
              toId: entityId,
            }),
          ],
          { confidence: "unverified" }
        )
      );
      expectViolation(outcome, /itself/);
    })
  );

  it.effect("assertPatchGates accepts related_to with notes", () =>
    assertPatchGates([edgeOp("related_to", "same household hypothesised")], {
      confidence: "unverified",
    })
  );

  it.effect("assertPatchShape accepts claim without confidence", () =>
    assertPatchShape([claimOp()])
  );

  it.effect("assertPatchShape trims padded entityId on claim ops", () =>
    assertPatchShape([
      claimOp({
        data: {
          entityId: `  ${entityId}  `,
          text: "observed host",
          class: "observation",
        },
      }),
    ])
  );

  it.effect("assertPatchShape case-folds claim class", () =>
    assertPatchShape([
      claimOp({
        data: {
          entityId,
          text: "observed host",
          class: "  OBSERVATION  ",
        },
      }),
    ])
  );

  it.effect("assertPatchShape case-folds identifier type", () =>
    assertPatchShape([
      {
        op: "create",
        resource: "identifier",
        id: opId,
        data: {
          entityId,
          type: "  EMAIL  ",
          value: "ada@mailhost.test",
        },
      },
    ])
  );

  it.effect("assertPatchShape rejects invalid op id UUIDs", () =>
    Effect.gen(function* rejectInvalidOpId() {
      const outcome = yield* Effect.result(
        assertPatchShape([
          claimOp({
            id: "not-a-uuid",
          }),
        ])
      );
      expectViolation(outcome, /patch op id must be a valid UUID/);
    })
  );

  it.effect("assertPatchShape rejects invalid entityId UUIDs", () =>
    Effect.gen(function* rejectInvalidEntityUuid() {
      const outcome = yield* Effect.result(
        assertPatchShape([
          claimOp({
            data: {
              entityId: "not-a-uuid",
              text: "observed host",
              class: "observation",
            },
          }),
        ])
      );
      expectViolation(outcome, /valid UUID/);
    })
  );

  it.effect("assertPatchShape rejects related_to without notes", () =>
    Effect.gen(function* shapeRejectRelatedTo() {
      const outcome = yield* Effect.result(
        assertPatchShape([edgeOp("related_to")])
      );
      expectViolation(outcome, /related_to/);
    })
  );

  it.effect("assertPatchShape rejects self-linked edges", () =>
    Effect.gen(function* shapeRejectSelfLink() {
      const outcome = yield* Effect.result(
        assertPatchShape([
          edgeOp("same_as", undefined, {
            fromId: entityId,
            toId: entityId,
          }),
        ])
      );
      expectViolation(outcome, /itself/);
    })
  );

  it.effect("assertPatchShape rejects empty entity update", () =>
    Effect.gen(function* shapeRejectEmptyEntityUpdate() {
      const outcome = yield* Effect.result(
        assertPatchShape([
          {
            op: "update",
            resource: "entity",
            id: opId,
            data: {},
          },
        ])
      );
      expectViolation(outcome, /entity update requires at least one field/);
    })
  );

  it.effect("assertPatchShape accepts entity update with summary", () =>
    assertPatchShape([
      {
        op: "update",
        resource: "entity",
        id: opId,
        data: { summary: "updated" },
      },
    ])
  );

  it.effect("assertPatchShape accepts entity update clearing summary", () =>
    assertPatchShape([
      {
        op: "update",
        resource: "entity",
        id: opId,
        data: { summary: null },
      },
    ])
  );

  it.effect(
    "assertPatchShape rejects entity update with non-string summary",
    () =>
      Effect.gen(function* shapeRejectBadEntitySummary() {
        const outcome = yield* Effect.result(
          assertPatchShape([
            {
              op: "update",
              resource: "entity",
              id: opId,
              data: { summary: 123 },
            },
          ])
        );
        expectViolation(outcome, /summary must be a string or null/);
      })
  );

  it.effect("assertPatchShape rejects entity update with non-string name", () =>
    Effect.gen(function* shapeRejectBadEntityName() {
      const outcome = yield* Effect.result(
        assertPatchShape([
          {
            op: "update",
            resource: "entity",
            id: opId,
            data: { name: 123, summary: "ok" },
          },
        ])
      );
      expectViolation(outcome, /entity name must be a string/);
    })
  );

  it.effect("assertPatchShape rejects unsupported entity update fields", () =>
    Effect.gen(function* shapeRejectUnsupportedEntityField() {
      const outcome = yield* Effect.result(
        assertPatchShape([
          {
            op: "update",
            resource: "entity",
            id: opId,
            data: { kind: "person", summary: "updated" },
          },
        ])
      );
      expectViolation(outcome, /does not support field: kind/);
    })
  );

  it.effect("assertPatchShape accepts invalid email at propose time", () =>
    assertPatchShape([
      {
        op: "create",
        resource: "identifier",
        id: opId,
        data: {
          entityId,
          type: "email",
          value: "not-an-email",
        },
      },
    ])
  );

  it.effect("assertPatchGates rejects invalid email at accept time", () =>
    Effect.gen(function* rejectInvalidEmailAtAccept() {
      const outcome = yield* Effect.result(
        assertPatchGates(
          [
            {
              op: "create",
              resource: "identifier",
              id: opId,
              data: {
                entityId,
                type: "email",
                value: "not-an-email",
              },
            },
          ],
          { confidence: "unverified" }
        )
      );
      expectViolation(outcome, /Invalid email/);
    })
  );

  it.effect("assertPatchGates rejects handle identifier without platform", () =>
    Effect.gen(function* gatesRejectHandleNoPlatform() {
      const outcome = yield* Effect.result(
        assertPatchGates(
          [
            {
              op: "create",
              resource: "identifier",
              id: opId,
              data: {
                entityId,
                type: "handle",
                value: "ada",
              },
            },
          ],
          { confidence: "unverified" }
        )
      );
      expectViolation(outcome, /platform/i);
    })
  );

  it.effect("assertPatchShape accepts handle identifier without platform", () =>
    assertPatchShape([
      {
        op: "create",
        resource: "identifier",
        id: opId,
        data: {
          entityId,
          type: "handle",
          value: "ada",
        },
      },
    ])
  );

  it.effect("assertPatchShape rejects smuggled confidence in op.data", () =>
    Effect.gen(function* shapeRejectSmuggledConfidence() {
      const outcome = yield* Effect.result(
        assertPatchShape([
          {
            ...claimOp(),
            data: {
              ...claimOp().data,
              confidence: "confirmed",
            },
          },
        ])
      );
      expectViolation(outcome, /op\.data\.confidence is forbidden/);
    })
  );

  it.effect(
    "assertPatchShape rejects smuggled confidence on entity create",
    () =>
      Effect.gen(function* shapeRejectEntitySmuggledConfidence() {
        const outcome = yield* Effect.result(
          assertPatchShape([
            {
              op: "create",
              resource: "entity",
              id: opId,
              data: {
                kind: "org",
                name: "Acme",
                slug: "acme",
                confidence: "confirmed",
              },
            },
          ])
        );
        expectViolation(outcome, /op\.data\.confidence is forbidden/);
      })
  );

  it.effect(
    "assertPatchShape rejects entity create with non-string summary",
    () =>
      Effect.gen(function* shapeRejectBadEntityCreateSummary() {
        const outcome = yield* Effect.result(
          assertPatchShape([
            {
              op: "create",
              resource: "entity",
              id: opId,
              data: {
                kind: "org",
                name: "Acme",
                slug: "acme",
                summary: 123,
              },
            },
          ])
        );
        expectViolation(outcome, /summary must be a string or null/);
      })
  );

  it.effect("assertPatchShape rejects unsupported entity create fields", () =>
    Effect.gen(function* shapeRejectUnsupportedEntityCreateField() {
      const outcome = yield* Effect.result(
        assertPatchShape([
          {
            op: "create",
            resource: "entity",
            id: opId,
            data: {
              kind: "org",
              name: "Acme",
              slug: "acme",
              entityId,
            },
          },
        ])
      );
      expectViolation(
        outcome,
        /entity create does not support field: entityId/
      );
    })
  );

  it.effect("assertPatchShape rejects entity slugs that slugify to empty", () =>
    Effect.gen(function* shapeRejectEmptyEntitySlug() {
      const outcome = yield* Effect.result(
        assertPatchShape([
          {
            op: "create",
            resource: "entity",
            id: opId,
            data: {
              kind: "org",
              name: "Acme",
              slug: "!!!",
            },
          },
        ])
      );
      expectViolation(outcome, /entity slug is required/);
    })
  );
});
