import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  PATCH_OP_KINDS,
  patchInputSchema,
  patchOpSchema,
  patchEntityOpDisplayLabel,
  patchOpHeadline,
  patchOpRelatedEntityIds,
  patchOpResource,
  patchOpSearchText,
  patchOpVerb,
  type PatchOp,
} from "../patch.ts";

const entityId = testId(20);
const otherEntityId = testId(21);
const opId = testId(30);

/** The first issue of a refused op: its path (dotted) and message. */
function refusal(raw: unknown): { path: string; message: string } | null {
  const parsed = patchOpSchema.safeParse(raw);
  if (parsed.success) return null;
  const [issue] = parsed.error.issues;
  return {
    path: (issue?.path ?? []).join("."),
    message: issue?.message ?? "",
  };
}

function op(kind: string, data: Record<string, unknown>, extra = {}) {
  return { kind, id: opId, data, ...extra };
}

const COMPLETE: Record<PatchOp["kind"], Record<string, unknown>> = {
  "entity.create": { kind: "person", name: "Ada", slug: "ada" },
  "entity.upsert": { kind: "person", name: "Ada", slug: "ada" },
  "entity.update": { summary: "Analyst" },
  "identifier.create": { entityId, type: "email", value: "a@mailhost.test" },
  "identifier.upsert": { entityId, type: "email", value: "a@mailhost.test" },
  "edge.create": {
    fromId: entityId,
    toId: otherEntityId,
    predicate: "associate_of",
  },
  "edge.upsert": {
    fromId: entityId,
    toId: otherEntityId,
    predicate: "associate_of",
  },
  "claim.create": { entityId, text: "observed host" },
  "event.create": { entityId, when: "2026-01-01", what: "Met" },
  "question.create": { entityId, text: "Who?" },
};

describe("patchOpSchema kinds", () => {
  it("lists exactly the kinds a patch can carry", () => {
    expect([...PATCH_OP_KINDS].sort()).toEqual(Object.keys(COMPLETE).sort());
  });

  for (const kind of PATCH_OP_KINDS) {
    it(`accepts the complete form of ${kind}`, () => {
      expect(refusal(op(kind, COMPLETE[kind]))).toBeNull();
    });
  }

  for (const kind of [
    "edge.update",
    "identifier.update",
    "claim.update",
    "claim.upsert",
    "event.update",
    "question.upsert",
    "claim.retract",
  ]) {
    it(`refuses the kind ${kind}`, () => {
      expect(refusal(op(kind, COMPLETE["claim.create"]))?.path).toBe("kind");
    });
  }

  it("refuses the old resource + op envelope", () => {
    expect(
      refusal({
        resource: "claim",
        op: "create",
        id: opId,
        data: COMPLETE["claim.create"],
      })
    ).not.toBeNull();
  });

  it("splits a kind into resource and verb", () => {
    expect(patchOpResource({ kind: "edge.upsert" })).toBe("edge");
    expect(patchOpVerb({ kind: "edge.upsert" })).toBe("upsert");
  });
});

describe("patchOpSchema data", () => {
  const cases: [name: string, raw: unknown, path: string][] = [
    ["a claim without text", op("claim.create", { entityId }), "data.text"],
    [
      "a claim with whitespace-only text",
      op("claim.create", { entityId, text: "  \n\t " }),
      "data.text",
    ],
    [
      "a claim with non-string text",
      op("claim.create", { entityId, text: 42 }),
      "data.text",
    ],
    [
      "a claim without an entity",
      op("claim.create", { text: "observed" }),
      "data.entityId",
    ],
    [
      "a claim with an unknown class",
      op("claim.create", { entityId, text: "observed", class: "rumour" }),
      "data.class",
    ],
    [
      "an event with a malformed entity id",
      op("event.create", { entityId: "nope", when: "2026", what: "Met" }),
      "data.entityId",
    ],
    [
      "an event with a blank time",
      op("event.create", { entityId, when: "  ", what: "Met" }),
      "data.when",
    ],
    [
      "an event without a description",
      op("event.create", { entityId, when: "2026" }),
      "data.what",
    ],
    [
      "a question without text",
      op("question.create", { entityId }),
      "data.text",
    ],
    [
      "an identifier without a type",
      op("identifier.create", { entityId, value: "a@mailhost.test" }),
      "data.type",
    ],
    [
      "an identifier with an unknown type",
      op("identifier.create", { entityId, type: "telepathy", value: "x" }),
      "data.type",
    ],
    [
      "an identifier without a value",
      op("identifier.create", { entityId, type: "email" }),
      "data.value",
    ],
    [
      "an identifier with an unknown status",
      op("identifier.upsert", {
        ...COMPLETE["identifier.upsert"],
        status: "maybe",
      }),
      "data.status",
    ],
    [
      "an edge without a target",
      op("edge.create", { fromId: entityId, predicate: "associate_of" }),
      "data.toId",
    ],
    [
      "an edge with an unknown predicate",
      op("edge.create", {
        fromId: entityId,
        toId: otherEntityId,
        predicate: "x",
      }),
      "data.predicate",
    ],
    [
      "an edge from an Entity to itself",
      op("edge.create", {
        fromId: entityId,
        toId: entityId,
        predicate: "associate_of",
      }),
      "data.toId",
    ],
    [
      "an entity with an unknown kind",
      op("entity.create", { kind: "spaceship", name: "Ada", slug: "ada" }),
      "data.kind",
    ],
    [
      "an entity without a slug",
      op("entity.create", { kind: "person", name: "Ada" }),
      "data.slug",
    ],
    [
      "an entity with non-string notes",
      op("entity.create", { kind: "person", name: "Ada", slug: "a", notes: 7 }),
      "data.notes",
    ],
    ["an entity update with nothing to set", op("entity.update", {}), "data"],
    [
      "an entity update that sets the slug",
      op("entity.update", { name: "Ada", slug: "ada" }),
      "data",
    ],
    [
      "a field the op does not take",
      op("question.create", { entityId, text: "Who?", status: "open" }),
      "data",
    ],
    [
      "a malformed op id",
      { ...op("question.create", COMPLETE["question.create"]), id: "op-1" },
      "id",
    ],
    [
      "an expected version on a create",
      op("claim.create", COMPLETE["claim.create"], { expectedVersion: 2 }),
      "",
    ],
  ];

  for (const [name, raw, path] of cases) {
    it(`refuses ${name}`, () => {
      expect(refusal(raw)?.path).toBe(path);
    });
  }

  for (const kind of ["claim.create", "identifier.upsert", "entity.create"]) {
    it(`refuses confidence in the data of ${kind}`, () => {
      expect(
        refusal(
          op(kind, {
            ...COMPLETE[kind as PatchOp["kind"]],
            confidence: "confirmed",
          })
        )
      ).toEqual({
        path: "data",
        message:
          "op.data.confidence is forbidden — confidence is chosen at Inbox Accept",
      });
    });
  }

  for (const [name, notes] of [
    ["missing", undefined],
    ["empty", ""],
    ["whitespace-only", "   \t "],
    ["null", null],
  ] as const) {
    it(`refuses related_to with ${name} notes`, () => {
      expect(
        refusal(
          op("edge.create", {
            fromId: entityId,
            toId: otherEntityId,
            predicate: "related_to",
            ...(notes === undefined ? {} : { notes }),
          })
        )
      ).toEqual({ path: "data.notes", message: "related_to requires notes" });
    });
  }

  it("accepts an expected version on an update or upsert", () => {
    expect(
      refusal(op("entity.update", { name: "Ada" }, { expectedVersion: 3 }))
    ).toBeNull();
    expect(
      refusal(
        op("edge.upsert", COMPLETE["edge.upsert"], { expectedVersion: 3 })
      )
    ).toBeNull();
  });

  it("normalizes ids, vocabulary, slugs and blank text", () => {
    const evidenceId = testId(46);
    const parsed = patchOpSchema.parse({
      kind: "entity.create",
      id: `  ${opId}  `,
      data: {
        kind: " ORG ",
        name: " Acme ",
        slug: "Acme Corp",
        summary: "  ",
      },
      evidenceIds: [`  ${evidenceId}  `, ""],
    });
    expect(parsed).toEqual({
      kind: "entity.create",
      id: opId,
      data: { kind: "org", name: "Acme", slug: "acme-corp", summary: null },
      evidenceIds: [evidenceId],
    });
  });

  it("bounds the ops of an input patch", () => {
    const one = op("question.create", COMPLETE["question.create"]);
    expect(
      patchInputSchema.safeParse(Array.from({ length: 1001 }, () => one))
        .success
    ).toBe(false);
  });
});

const edge = (
  data: Partial<Extract<PatchOp, { kind: "edge.create" }>["data"]> = {}
): PatchOp => ({
  kind: "edge.create",
  id: testId(32),
  data: {
    fromId: entityId,
    toId: otherEntityId,
    predicate: "hosted_on",
    ...data,
  },
});

describe("patchOpRelatedEntityIds", () => {
  it("collects entityId and edge endpoint ids", () => {
    expect(patchOpRelatedEntityIds(edge())).toEqual([entityId, otherEntityId]);
  });

  it("includes entity op id for entity ops", () => {
    expect(
      patchOpRelatedEntityIds({
        kind: "entity.update",
        id: testId(40),
        data: { name: "Acme" },
      })
    ).toEqual([testId(40)]);
  });
});

describe("patchEntityOpDisplayLabel", () => {
  it("returns display label from entity patch op body", () => {
    expect(
      patchEntityOpDisplayLabel({
        kind: "entity.create",
        id: testId(41),
        data: { kind: "org", name: "Acme Corp", slug: "acme-corp" },
      })
    ).toBe("Acme Corp");
  });

  it("returns null for non-entity ops", () => {
    expect(
      patchEntityOpDisplayLabel({
        kind: "claim.create",
        id: testId(42),
        data: { entityId, text: "observed" },
      })
    ).toBeNull();
  });
});

describe("patchOpSearchText", () => {
  it("includes edge notes and predicates", () => {
    expect(patchOpSearchText(edge({ notes: "shared registrar" }))).toBe(
      "shared registrar hosted_on Hosted on"
    );
  });

  it("includes entity fields with their labels", () => {
    expect(
      patchOpSearchText({
        kind: "entity.create",
        id: testId(39),
        data: {
          kind: "org",
          name: "Acme",
          slug: "acme-corp",
          summary: "Shell company for the fraud thread",
        },
      })
    ).toBe("Acme acme-corp Shell company for the fraud thread org Org");
  });

  it("includes event fields", () => {
    expect(
      patchOpSearchText({
        kind: "event.create",
        id: testId(40),
        data: {
          entityId,
          when: "2024-01-15",
          what: "Registered domain",
          where: "Delaware",
        },
      })
    ).toBe("Registered domain 2024-01-15 Delaware");
  });

  it("includes identifier platform, type and status labels", () => {
    expect(
      patchOpSearchText({
        kind: "identifier.create",
        id: testId(38),
        data: {
          entityId,
          type: "handle",
          value: "acme-corp",
          platform: "twitter",
        },
      })
    ).toBe("acme-corp twitter x / twitter x twitter twit handle Handle");
    expect(
      patchOpSearchText({
        kind: "identifier.create",
        id: testId(43),
        data: {
          entityId,
          type: "email",
          value: "ops@acme.test",
          status: "current",
        },
      })
    ).toBe("ops@acme.test email Email current Current");
  });

  it("includes claim text and class", () => {
    expect(
      patchOpSearchText({
        kind: "claim.create",
        id: testId(42),
        data: { entityId, text: "Uses a Delaware shell", class: "assessment" },
      })
    ).toBe("Uses a Delaware shell assessment Assessment");
  });
});

describe("patchOpHeadline", () => {
  it("title-cases verb and resource labels", () => {
    expect(patchOpHeadline(edge())).toBe("Create Connection");
  });
});
