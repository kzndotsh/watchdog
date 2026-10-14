import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import type { PatchOp } from "@watchdog/schemas/graph";
import type { JsonValue } from "@watchdog/schemas/shared";

import { assertPatchGates, assertPatchShape } from "../patch-gates.ts";

/**
 * The per-resource shape rules and the confirmed-evidence predicate of the custody gate,
 * one behavior per case. `patch-gates.test.ts` holds the broader scenarios; this file pins
 * the branches a mutation run showed no test reached (issue #273).
 */
const entityId = "11111111-1111-4111-8111-111111111111";
const evidenceId = "22222222-2222-4222-8222-222222222222";
const otherEvidenceId = "55555555-5555-4555-8555-555555555555";
const opId = "33333333-3333-4333-8333-333333333333";
const otherEntityId = "44444444-4444-4444-8444-444444444444";

function op(
  resource: PatchOp["resource"],
  data: Record<string, JsonValue>,
  extra: Partial<PatchOp> = {}
): PatchOp {
  return { op: "create", resource, id: opId, data, ...extra };
}

function claim(data: Record<string, JsonValue>, extra?: Partial<PatchOp>) {
  return op("claim", data, extra);
}

function reasonOf(patch: PatchOp[]) {
  return Effect.gen(function* shapeReason() {
    const outcome = yield* Effect.result(assertPatchShape(patch));
    return Result.isFailure(outcome) ? outcome.failure.reason : null;
  });
}

function gateReasonOf(
  patch: PatchOp[],
  opts: Parameters<typeof assertPatchGates>[1]
) {
  return Effect.gen(function* gateReason() {
    const outcome = yield* Effect.result(assertPatchGates(patch, opts));
    return Result.isFailure(outcome) ? outcome.failure.reason : null;
  });
}

type Case = readonly [name: string, patch: PatchOp[], reason: string];

describe("assertPatchShape required fields", () => {
  const cases: Case[] = [
    ["a claim without text", [claim({ entityId })], "text is required"],
    [
      "a claim with empty text",
      [claim({ entityId, text: "" })],
      "text is required",
    ],
    [
      "a claim with whitespace-only text",
      [claim({ entityId, text: "   \n\t " })],
      "text is required",
    ],
    [
      "a claim with non-string text",
      [claim({ entityId, text: 42 })],
      "text is required",
    ],
    [
      "a claim without an entity",
      [claim({ text: "observed host" })],
      "entityId is required",
    ],
    [
      "an event without an entity",
      [op("event", { when: "2026-01-01", what: "Met" })],
      "entityId is required",
    ],
    [
      "an event with a malformed entity id",
      [op("event", { entityId: "nope", when: "2026-01-01", what: "Met" })],
      "entityId must be a valid UUID",
    ],
    [
      "an event without a time",
      [op("event", { entityId, what: "Met" })],
      "when is required",
    ],
    [
      "an event with a blank time",
      [op("event", { entityId, when: "  ", what: "Met" })],
      "when is required",
    ],
    [
      "an event without a description",
      [op("event", { entityId, when: "2026-01-01" })],
      "what is required",
    ],
    [
      "an event with a blank description",
      [op("event", { entityId, when: "2026-01-01", what: " " })],
      "what is required",
    ],
    [
      "a question without an entity",
      [op("question", { text: "Who?" })],
      "entityId is required",
    ],
    [
      "a question with a malformed entity id",
      [op("question", { entityId: "nope", text: "Who?" })],
      "entityId must be a valid UUID",
    ],
    [
      "a question without text",
      [op("question", { entityId })],
      "text is required",
    ],
    [
      "a question with whitespace-only text",
      [op("question", { entityId, text: "  " })],
      "text is required",
    ],
    [
      "an identifier without an entity",
      [op("identifier", { type: "email", value: "a@mailhost.test" })],
      "entityId is required",
    ],
    [
      "an identifier without a type",
      [op("identifier", { entityId, value: "a@mailhost.test" })],
      "type is required",
    ],
    [
      "an identifier with an unknown type",
      [op("identifier", { entityId, type: "telepathy", value: "x" })],
      "Invalid identifier type: telepathy",
    ],
    [
      "an identifier without a value",
      [op("identifier", { entityId, type: "email" })],
      "value is required",
    ],
    [
      "an identifier with an unknown status",
      [
        op("identifier", {
          entityId,
          type: "email",
          value: "a@mailhost.test",
          status: "maybe",
        }),
      ],
      "Invalid identifier status: maybe",
    ],
    [
      "an edge without a source",
      [op("edge", { toId: otherEntityId, predicate: "associate_of" })],
      "fromId is required",
    ],
    [
      "an edge without a target",
      [op("edge", { fromId: entityId, predicate: "associate_of" })],
      "toId is required",
    ],
    [
      "an edge without a predicate",
      [op("edge", { fromId: entityId, toId: otherEntityId })],
      "predicate is required",
    ],
    [
      "an entity without a kind",
      [op("entity", { name: "Ada", slug: "ada" })],
      "kind is required",
    ],
    [
      "an entity with an unknown kind",
      [op("entity", { kind: "spaceship", name: "Ada", slug: "ada" })],
      "Invalid entity kind: spaceship",
    ],
    [
      "an entity without a name",
      [op("entity", { kind: "person", slug: "ada" })],
      "name is required",
    ],
    [
      "an entity without a slug",
      [op("entity", { kind: "person", name: "Ada" })],
      "slug is required",
    ],
    [
      "an entity with non-string notes",
      [op("entity", { kind: "person", name: "Ada", slug: "ada", notes: 7 })],
      "entity notes must be a string or null",
    ],
    [
      "an entity with non-string summary",
      [op("entity", { kind: "person", name: "Ada", slug: "ada", summary: 7 })],
      "entity summary must be a string or null",
    ],
  ];

  for (const [name, patch, reason] of cases) {
    it.effect(`rejects ${name}`, () =>
      Effect.gen(function* rejectsRequired() {
        expect(yield* reasonOf(patch)).toBe(reason);
      })
    );
  }

  it.effect("accepts the complete form of every resource", () =>
    assertPatchShape([
      claim({ entityId, text: "observed host" }),
      op("event", { entityId, when: "2026-01-01", what: "Met" }),
      op("question", { entityId, text: "Who?" }),
      op("identifier", { entityId, type: "email", value: "a@mailhost.test" }),
      op("edge", {
        fromId: entityId,
        toId: otherEntityId,
        predicate: "associate_of",
      }),
      op("entity", { kind: "person", name: "Ada", slug: "ada" }),
    ])
  );
});

describe("assertPatchShape operation kinds", () => {
  const edgeData = {
    fromId: entityId,
    toId: otherEntityId,
    predicate: "associate_of",
  } as const;
  const cases: Case[] = [
    [
      "an edge update",
      [op("edge", edgeData, { op: "update" })],
      "edge supports create/upsert",
    ],
    [
      "an identifier update",
      [
        op(
          "identifier",
          { entityId, type: "email", value: "a@mailhost.test" },
          { op: "update" }
        ),
      ],
      "identifier supports create/upsert",
    ],
    [
      "a claim update",
      [claim({ entityId, text: "observed host" }, { op: "update" })],
      "claim only supports create",
    ],
    [
      "a claim upsert",
      [claim({ entityId, text: "observed host" }, { op: "upsert" })],
      "claim only supports create",
    ],
    [
      "an event update",
      [
        op(
          "event",
          { entityId, when: "2026-01-01", what: "Met" },
          { op: "update" }
        ),
      ],
      "event only supports create",
    ],
    [
      "a question upsert",
      [op("question", { entityId, text: "Who?" }, { op: "upsert" })],
      "question only supports create",
    ],
  ];

  for (const [name, patch, reason] of cases) {
    it.effect(`rejects ${name}`, () =>
      Effect.gen(function* rejectsKind() {
        expect(yield* reasonOf(patch)).toBe(reason);
      })
    );
  }

  it.effect("accepts an edge and an identifier upsert", () =>
    assertPatchShape([
      op("edge", edgeData, { op: "upsert" }),
      op(
        "identifier",
        { entityId, type: "email", value: "a@mailhost.test" },
        { op: "upsert" }
      ),
    ])
  );
});

describe("assertPatchShape related_to notes", () => {
  const related = (notes?: JsonValue): PatchOp[] => [
    op("edge", {
      fromId: entityId,
      toId: otherEntityId,
      predicate: "related_to",
      ...(notes === undefined ? {} : { notes }),
    }),
  ];

  for (const [name, notes] of [
    ["missing", undefined],
    ["empty", ""],
    ["whitespace-only", "   \t "],
    ["null", null],
    ["not a string", 12],
  ] as const) {
    it.effect(`rejects related_to with ${name} notes`, () =>
      Effect.gen(function* rejectsNotes() {
        expect(yield* reasonOf(related(notes))).toBe(
          "related_to requires notes"
        );
      })
    );
  }

  it.effect("accepts related_to with real notes", () =>
    assertPatchShape(related("same household"))
  );

  it.effect("does not ask other predicates for notes", () =>
    assertPatchShape([
      op("edge", {
        fromId: entityId,
        toId: otherEntityId,
        predicate: "associate_of",
        notes: "   ",
      }),
    ])
  );
});

describe("assertPatchGates confirmed evidence over op evidenceIds", () => {
  const confirmed = { confidence: "confirmed" } as const;
  const withIds = (evidenceIds: string[]) => [
    claim({ entityId, text: "observed host" }, { evidenceIds }),
  ];
  const NEEDS = "confirmed requires at least one Evidence attachment";

  // Blank entries are dropped, so one real id among them is still Evidence.
  for (const [name, ids] of [
    ["a real id then a blank", [evidenceId, ""]],
    ["a blank then a real id", ["", evidenceId]],
    ["a real id among whitespace-only entries", ["  ", evidenceId, "\t"]],
    ["a padded real id", [`  ${evidenceId}  `]],
  ] as const) {
    it.effect(`allows confirmed with ${name}`, () =>
      assertPatchGates(withIds([...ids]), confirmed)
    );
  }

  for (const [name, ids] of [
    ["only blank ids", ["", ""]],
    ["only whitespace ids", ["  ", "\n"]],
    ["no ids", []],
  ] as const) {
    it.effect(`refuses confirmed with ${name}`, () =>
      Effect.gen(function* refusesBlank() {
        expect(yield* gateReasonOf(withIds([...ids]), confirmed)).toBe(NEEDS);
      })
    );
  }

  it.effect("names an invalid id among valid ones instead of ignoring it", () =>
    Effect.gen(function* namesInvalid() {
      expect(
        yield* gateReasonOf(withIds([evidenceId, "not-a-uuid"]), confirmed)
      ).toBe("patch op evidenceIds contains an invalid UUID");
    })
  );

  it.effect("counts Evidence on any one op, not on every op", () =>
    assertPatchGates(
      [
        claim({ entityId, text: "first, no evidence" }),
        claim(
          { entityId, text: "second, with evidence" },
          { evidenceIds: [otherEvidenceId] }
        ),
      ],
      confirmed
    )
  );

  it.effect("refuses confirmed when no op has any Evidence", () =>
    Effect.gen(function* refusesAllEmpty() {
      expect(
        yield* gateReasonOf(
          [
            claim({ entityId, text: "first" }),
            claim({ entityId, text: "second" }, { evidenceIds: [""] }),
          ],
          confirmed
        )
      ).toBe(NEEDS);
    })
  );

  it.effect("lets shared Evidence cover ops that carry none", () =>
    assertPatchGates([claim({ entityId, text: "observed host" })], {
      ...confirmed,
      sharedEvidenceIds: [evidenceId, ""],
    })
  );

  it.effect("does not ask for Evidence below the confirmed tier", () =>
    Effect.gen(function* belowConfirmed() {
      expect(
        yield* gateReasonOf(withIds([]), { confidence: "possible" })
      ).toBeNull();
    })
  );
});
