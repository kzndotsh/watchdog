import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  patchOpSchema,
  patchEntityOpDisplayLabel,
  patchOpHeadline,
  patchOpRelatedEntityIds,
  patchOpSearchText,
} from "../patch.ts";

describe("patchOpSchema", () => {
  it("rejects confidence smuggled onto a claim op", () => {
    const parsed = patchOpSchema.safeParse({
      op: "create",
      resource: "claim",
      id: testId(30),
      data: {
        entityId: testId(20),
        text: "Ada observed a host",
        class: "observation",
        confidence: "confirmed",
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects confidence smuggled onto an entity op", () => {
    const parsed = patchOpSchema.safeParse({
      op: "create",
      resource: "entity",
      id: testId(44),
      data: {
        kind: "org",
        name: "Acme",
        slug: "acme",
        confidence: "confirmed",
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an event op without confidence", () => {
    const parsed = patchOpSchema.safeParse({
      op: "create",
      resource: "event",
      id: testId(31),
      data: {
        entityId: testId(20),
        when: "1815-12-10",
        what: "Born",
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("trims padded op ids and evidenceIds", () => {
    const opId = testId(45);
    const evidenceId = testId(46);
    const parsed = patchOpSchema.parse({
      op: "create",
      resource: "claim",
      id: `  ${opId}  `,
      data: {
        entityId: testId(20),
        text: "observed",
        class: "observation",
      },
      evidenceIds: [`  ${evidenceId}  `],
    });
    expect(parsed.id).toBe(opId);
    expect(parsed.evidenceIds).toEqual([evidenceId]);
  });
});

describe("patchOpRelatedEntityIds", () => {
  it("collects entityId and edge endpoint ids", () => {
    expect(
      patchOpRelatedEntityIds({
        op: "create",
        resource: "edge",
        id: testId(32),
        data: {
          fromId: testId(20),
          toId: testId(21),
          predicate: "knows",
        },
      })
    ).toEqual([testId(20), testId(21)]);
  });

  it("includes entity op id for entity resource ops", () => {
    const entityId = testId(40);
    expect(
      patchOpRelatedEntityIds({
        op: "create",
        resource: "entity",
        id: entityId,
        data: { name: "Acme", slug: "acme" },
      })
    ).toEqual([entityId]);
  });

  it("trims padded entity and edge endpoint ids", () => {
    const fromId = testId(20);
    const toId = testId(21);
    const entityId = testId(40);
    expect(
      patchOpRelatedEntityIds({
        op: "create",
        resource: "edge",
        id: testId(32),
        data: {
          fromId: `  ${fromId}  `,
          toId: `  ${toId}  `,
          predicate: "knows",
        },
      })
    ).toEqual([fromId, toId]);
    expect(
      patchOpRelatedEntityIds({
        op: "create",
        resource: "entity",
        id: `  ${entityId}  `,
        data: { name: "Acme", slug: "acme" },
      })
    ).toEqual([entityId]);
  });

  it("drops invalid entity and edge endpoint ids", () => {
    const fromId = testId(20);
    expect(
      patchOpRelatedEntityIds({
        op: "create",
        resource: "edge",
        id: testId(32),
        data: {
          fromId,
          toId: "ent-2",
          predicate: "knows",
        },
      })
    ).toEqual([fromId]);
  });
});

describe("patchEntityOpDisplayLabel", () => {
  it("returns display label from entity patch op body", () => {
    expect(
      patchEntityOpDisplayLabel({
        op: "create",
        resource: "entity",
        id: testId(41),
        data: { name: "Acme Corp", slug: "acme-corp" },
      })
    ).toBe("Acme Corp");
  });

  it("returns null for non-entity ops", () => {
    expect(
      patchEntityOpDisplayLabel({
        op: "create",
        resource: "claim",
        id: testId(42),
        data: { entityId: testId(20), text: "observed" },
      })
    ).toBeNull();
  });
});

describe("patchOpSearchText", () => {
  it("includes claim text, identifier values, and edge notes", () => {
    expect(
      patchOpSearchText({
        op: "create",
        resource: "edge",
        id: testId(33),
        data: {
          fromId: testId(20),
          toId: testId(21),
          notes: "shared registrar",
        },
      })
    ).toBe("shared registrar");
  });

  it("includes event when and entity name fields", () => {
    expect(
      patchOpSearchText({
        op: "create",
        resource: "event",
        id: testId(35),
        data: {
          entityId: testId(20),
          when: "2024-01-15",
        },
      })
    ).toBe("2024-01-15");
    expect(
      patchOpSearchText({
        op: "create",
        resource: "entity",
        id: testId(36),
        data: {
          kind: "person",
          name: "Ada Lovelace",
        },
      })
    ).toBe("Ada Lovelace person Person");
  });

  it("includes edge predicates and identifier platform", () => {
    expect(
      patchOpSearchText({
        op: "create",
        resource: "edge",
        id: testId(37),
        data: {
          fromId: testId(20),
          toId: testId(21),
          predicate: "hosted_on",
          notes: "shared registrar",
        },
      })
    ).toBe("shared registrar hosted_on Hosted on");
    expect(
      patchOpSearchText({
        op: "create",
        resource: "identifier",
        id: testId(38),
        data: {
          entityId: testId(20),
          type: "handle",
          value: "acme-corp",
          platform: "twitter",
        },
      })
    ).toBe("acme-corp twitter x / twitter x twitter twit handle Handle");
  });

  it("includes claim class and identifier status", () => {
    expect(
      patchOpSearchText({
        op: "create",
        resource: "claim",
        id: testId(42),
        data: {
          entityId: testId(20),
          text: "Uses a Delaware shell",
          class: "assessment",
        },
      })
    ).toBe("Uses a Delaware shell assessment Assessment");
    expect(
      patchOpSearchText({
        op: "create",
        resource: "identifier",
        id: testId(43),
        data: {
          entityId: testId(20),
          type: "email",
          value: "ops@acme.test",
          status: "current",
        },
      })
    ).toBe("ops@acme.test email Email current Current");
  });

  it("includes entity summary and event where fields", () => {
    expect(
      patchOpSearchText({
        op: "create",
        resource: "entity",
        id: testId(39),
        data: {
          kind: "org",
          name: "Acme",
          slug: "acme-corp",
          summary: "Shell company for the fraud thread",
        },
      })
    ).toBe("Acme acme-corp Shell company for the fraud thread org Org");
    expect(
      patchOpSearchText({
        op: "create",
        resource: "event",
        id: testId(40),
        data: {
          entityId: testId(20),
          when: "2024-01-15",
          what: "Registered domain",
          where: "Delaware",
        },
      })
    ).toBe("Registered domain 2024-01-15 Delaware");
    expect(
      patchOpSearchText({
        op: "update",
        resource: "question",
        id: testId(41),
        data: {
          entityId: testId(20),
          text: "Who owns the domain?",
          resolvedNote: "Delaware shell filing",
        },
      })
    ).toBe("Who owns the domain? Delaware shell filing");
  });

  it("ignores whitespace-only claim text", () => {
    expect(
      patchOpSearchText({
        op: "create",
        resource: "claim",
        id: testId(47),
        data: {
          entityId: testId(20),
          text: "   ",
          class: "observation",
        },
      })
    ).toBe("observation Observation");
  });
});

describe("patchOpHeadline", () => {
  it("title-cases verb and resource labels", () => {
    expect(
      patchOpHeadline({
        op: "create",
        resource: "edge",
        id: testId(34),
        data: {},
      })
    ).toBe("Create Connection");
  });
});
