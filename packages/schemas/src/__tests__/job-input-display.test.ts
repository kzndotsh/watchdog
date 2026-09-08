import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  evidenceIdsFromJobInputs,
  entityIdsFromJobInputs,
  entityTitleMapForJobInputs,
  evidenceTitleMapForJobInputs,
  jobInputGraphIdFieldIssues,
  jobInputObjectSchema,
  normalizeJobInput,
  parseCapJobInput,
  summarizeJobInput,
} from "../job-input-display";

describe("parseCapJobInput", () => {
  const permissiveCap = z.object({
    host: z.string().optional(),
    entityId: z.string().optional(),
  });

  it("rejects invalid graph id fields after cap schema parse", () => {
    const result = parseCapJobInput(permissiveCap, {
      host: "example.com",
      entityId: "not-a-uuid",
    });
    expect(result).toEqual({ ok: false, message: "Invalid entityId" });
  });

  it("normalizes valid graph id fields", () => {
    const entityId = "00000000-0000-4000-8000-000000000050";
    const result = parseCapJobInput(permissiveCap, {
      entityId: `  ${entityId}  `,
      host: "example.com",
    });
    expect(result).toEqual({
      ok: true,
      input: { entityId, host: "example.com" },
    });
  });
});

describe("summarizeJobInput", () => {
  it("returns empty for missing input", () => {
    expect(summarizeJobInput(undefined)).toBe("");
    expect(summarizeJobInput(null)).toBe("");
  });

  it("prefers host-style hints", () => {
    expect(summarizeJobInput({ host: "example.com", limit: 10 })).toBe(
      "example.com"
    );
  });

  it("skips internal keys in fallback scan", () => {
    expect(summarizeJobInput({ limit: 10, custom: "seed-value" })).toBe(
      "seed-value"
    );
  });

  it("resolves evidence ids via title map", () => {
    const titles = new Map([["ev-1", "screenshot.png"]]);
    expect(
      summarizeJobInput({ evidenceId: "ev-1", entityId: "ent-1" }, titles)
    ).toBe("screenshot.png");
  });

  it("resolves entity ids via title map when no stronger hint exists", () => {
    const entityA = "00000000-0000-4000-8000-000000000010";
    const entityTitles = new Map([["ent-1", "Alpha Corp"]]);
    expect(
      summarizeJobInput({ entityId: "ent-1" }, undefined, entityTitles)
    ).toBe("Alpha Corp");
    expect(
      summarizeJobInput(
        { entityId: `  ${entityA}  ` },
        undefined,
        new Map([[entityA, "Alpha Corp"]])
      )
    ).toBe("Alpha Corp");
  });
});

describe("entityIdsFromJobInputs", () => {
  const entityA = "00000000-0000-4000-8000-000000000010";
  const entityB = "00000000-0000-4000-8000-000000000011";

  it("collects trimmed entityId values across rows", () => {
    expect(
      entityIdsFromJobInputs([
        { entityId: entityA },
        { entityId: `  ${entityB}  ` },
        { host: "example.com" },
      ])
    ).toEqual([entityA, entityB]);
  });

  it("drops invalid entity ids", () => {
    expect(
      entityIdsFromJobInputs([{ entityId: "ent-1" }, { entityId: entityA }])
    ).toEqual([entityA]);
  });
});

describe("entityTitleMapForJobInputs", () => {
  const entityA = "00000000-0000-4000-8000-000000000010";
  const entityB = "00000000-0000-4000-8000-000000000011";

  it("maps only entities referenced in job inputs", () => {
    const map = entityTitleMapForJobInputs(
      [
        { id: entityA, name: "Alpha", slug: "alpha" },
        { id: entityB, name: "Beta", slug: "beta" },
      ],
      [{ entityId: entityA }, { host: "example.com" }]
    );
    expect([...map.entries()]).toEqual([[entityA, "Alpha"]]);
  });

  it("returns empty map when no entity ids are referenced", () => {
    expect(
      entityTitleMapForJobInputs(
        [{ id: entityA, name: "Alpha" }],
        [{ host: "example.com" }]
      ).size
    ).toBe(0);
  });
});

describe("evidenceTitleMapForJobInputs", () => {
  const evidenceA = "00000000-0000-4000-8000-000000000020";
  const evidenceB = "00000000-0000-4000-8000-000000000021";

  it("maps only evidence referenced in job inputs", () => {
    const map = evidenceTitleMapForJobInputs(
      [
        {
          id: evidenceA,
          label: "screenshot.png",
          kind: "screenshot",
        },
        {
          id: evidenceB,
          label: "notes.txt",
          kind: "attestation",
        },
      ],
      [{ evidenceId: evidenceA }, { host: "example.com" }]
    );
    expect([...map.entries()]).toEqual([[evidenceA, "screenshot.png"]]);
  });
});

describe("evidenceIdsFromJobInputs", () => {
  const evidenceA = "00000000-0000-4000-8000-000000000020";
  const evidenceB = "00000000-0000-4000-8000-000000000021";

  it("collects evidenceId and sourceEvidenceId across rows", () => {
    expect(
      evidenceIdsFromJobInputs([
        { evidenceId: evidenceA },
        { sourceEvidenceId: evidenceB },
        null,
        { other: "x" },
      ])
    ).toEqual([evidenceA, evidenceB]);
  });

  it("trims whitespace from evidence ids", () => {
    expect(
      evidenceIdsFromJobInputs([{ evidenceId: `  ${evidenceA}  ` }])
    ).toEqual([evidenceA]);
    expect(
      summarizeJobInput(
        { evidenceId: `  ${evidenceA}  ` },
        new Map([[evidenceA, "screenshot.png"]])
      )
    ).toBe("screenshot.png");
  });

  it("drops invalid evidence ids", () => {
    expect(
      evidenceIdsFromJobInputs([
        { evidenceId: "ev-1" },
        { evidenceId: evidenceA },
      ])
    ).toEqual([evidenceA]);
  });
});

describe("jobInputObjectSchema", () => {
  it("trims padded graph ids at ingress", () => {
    const entityId = "00000000-0000-4000-8000-000000000050";
    const evidenceId = "00000000-0000-4000-8000-000000000099";
    expect(
      jobInputObjectSchema.parse({
        entityId: `  ${entityId}  `,
        evidenceId: `  ${evidenceId}  `,
        host: "example.com",
      })
    ).toEqual({ entityId, evidenceId, host: "example.com" });
  });

  it("defaults to empty object", () => {
    expect(jobInputObjectSchema.parse(undefined)).toEqual({});
  });

  it("rejects invalid graph id fields", () => {
    const entityId = "00000000-0000-4000-8000-000000000050";
    expect(() =>
      jobInputObjectSchema.parse({
        entityId: "ent-1",
        host: "example.com",
      })
    ).toThrow(/Invalid entityId/);
    expect(() =>
      jobInputObjectSchema.parse({
        entityId,
        evidenceId: "not-a-uuid",
      })
    ).toThrow(/Invalid evidenceId/);
  });
});

describe("jobInputGraphIdFieldIssues", () => {
  it("lists invalid non-blank graph id keys", () => {
    expect(
      jobInputGraphIdFieldIssues({
        entityId: "bad",
        evidenceId: "also-bad",
        host: "example.com",
      })
    ).toEqual(["evidenceId", "entityId"]);
    expect(jobInputGraphIdFieldIssues({ host: "example.com" })).toEqual([]);
  });
});

describe("normalizeJobInput", () => {
  const entityId = "00000000-0000-4000-8000-000000000050";
  const evidenceId = "00000000-0000-4000-8000-000000000099";

  it("trims graph id fields and drops blank values", () => {
    expect(
      normalizeJobInput({
        entityId: `  ${entityId}  `,
        evidenceId: "   ",
        sourceEvidenceId: `  ${evidenceId}  `,
        host: "example.com",
      })
    ).toEqual({
      entityId,
      sourceEvidenceId: evidenceId,
      host: "example.com",
    });
  });

  it("leaves invalid graph id fields for ingress validation to reject", () => {
    expect(
      normalizeJobInput({
        entityId: "ent-1",
        evidenceId,
        host: "example.com",
      })
    ).toEqual({
      entityId: "ent-1",
      evidenceId,
      host: "example.com",
    });
  });

  it("returns the original object when no id fields change", () => {
    const input = { host: "example.com", entityId };
    expect(normalizeJobInput(input)).toBe(input);
  });
});
