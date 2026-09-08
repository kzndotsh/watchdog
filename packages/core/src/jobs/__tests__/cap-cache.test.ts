import { describe, expect, it } from "vitest";

import { hashCapInput } from "../cap-cache";

describe("cap-cache", () => {
  it("hashCapInput is stable for key order in plain objects", () => {
    const a = hashCapInput({ b: 2, a: 1 });
    const b = hashCapInput({ a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashCapInput stringifies non-record inputs", () => {
    expect(hashCapInput("plain")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashCapInput normalizes padded graph id fields", () => {
    const entityId = "00000000-0000-4000-8000-000000000001";
    const evidenceId = "00000000-0000-4000-8000-000000000099";
    const canonical = hashCapInput({
      entityId,
      evidenceId,
      host: "example.com",
    });
    expect(
      hashCapInput({
        entityId: `  ${entityId}  `,
        evidenceId: `  ${evidenceId}  `,
        sourceEvidenceId: "   ",
        host: "example.com",
      })
    ).toBe(canonical);
  });
});
