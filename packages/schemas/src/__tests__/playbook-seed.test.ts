import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { playbookSeedInputSchema } from "../playbook-seed";

describe("playbookSeedInputSchema", () => {
  it("accepts a non-empty host seed", () => {
    expect(playbookSeedInputSchema.parse({ host: "example.com" })).toEqual({
      host: "example.com",
    });
  });

  it("rejects an empty seed object", () => {
    expect(() => playbookSeedInputSchema.parse({})).toThrow();
  });

  it("rejects invalid http urls", () => {
    expect(() =>
      playbookSeedInputSchema.parse({ url: "ftp://example.com" })
    ).toThrow();
  });

  it("accepts https urls and evidence ids", () => {
    const evidenceId = testId(40);
    expect(
      playbookSeedInputSchema.parse({
        url: "https://example.com/page",
        evidenceId,
      })
    ).toEqual({
      url: "https://example.com/page",
      evidenceId,
    });
  });

  it("trims padded playbook seed urls", () => {
    expect(
      playbookSeedInputSchema.parse({
        url: "  https://example.com/page  ",
      }).url
    ).toBe("https://example.com/page");
  });

  it("trims padded evidence and entity ids", () => {
    const evidenceId = testId(41);
    const entityId = testId(42);
    expect(
      playbookSeedInputSchema.parse({
        host: "example.com",
        evidenceId: `  ${evidenceId}  `,
        entityId: `  ${entityId}  `,
      })
    ).toEqual({
      host: "example.com",
      evidenceId,
      entityId,
    });
  });

  it("treats whitespace-only evidence id as absent when another seed is present", () => {
    expect(
      playbookSeedInputSchema.parse({
        host: "example.com",
        evidenceId: "   ",
      })
    ).toEqual({ host: "example.com" });
  });
});
