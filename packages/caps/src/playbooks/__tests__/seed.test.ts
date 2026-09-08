import { describe, expect, it } from "vitest";

import {
  hostFromUrl,
  presentSeedKinds,
  seedField,
  seedValuesFromJson,
  seedValuesToCandidateInput,
  seedValuesToJson,
} from "../seed";

describe("playbook seed helpers", () => {
  it("hostFromUrl extracts hostname", () => {
    expect(hostFromUrl("https://Sub.Example.com/path")).toBe("sub.example.com");
  });

  it("seedField derives host from url when host missing", () => {
    expect(seedField({ url: "https://example.com/x" }, "host")).toBe(
      "example.com"
    );
  });

  it("presentSeedKinds lists non-empty seed kinds", () => {
    expect([
      ...presentSeedKinds({ email: "a@b.com", host: "example.com" }),
    ]).toEqual(expect.arrayContaining(["email", "host"]));
  });

  it("round-trips seed values through json helpers", () => {
    const seed = {
      host: "example.com",
      entityId: "00000000-0000-4000-8000-000000000001",
    };
    const json = seedValuesToJson(seed);
    expect(seedValuesFromJson(json)).toEqual(seed);
  });

  it("seedValuesFromJson trims stored seed strings", () => {
    expect(
      seedValuesFromJson({ host: "  example.com  ", email: "   " })
    ).toEqual({ host: "example.com" });
  });

  it("seedValuesToJson trims seed strings before persistence", () => {
    expect(
      seedValuesToJson({
        host: "  example.com  ",
        entityId: "  00000000-0000-4000-8000-000000000001  ",
      })
    ).toEqual({
      host: "example.com",
      entityId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("seedValuesToCandidateInput trims ids before step input", () => {
    const input = seedValuesToCandidateInput({
      evidenceId: "  00000000-0000-4000-8000-000000000099  ",
      email: "  alice@mailhost.test  ",
    });
    expect(input).toEqual({
      evidenceId: "00000000-0000-4000-8000-000000000099",
      sourceEvidenceId: "00000000-0000-4000-8000-000000000099",
      email: "alice@mailhost.test",
      query: "alice@mailhost.test",
    });
  });

  it("seedValuesToCandidateInput adds query and derived host", () => {
    const input = seedValuesToCandidateInput({
      email: "alice@mailhost.test",
      url: "https://wiki.example.org/x",
    });
    expect(input.query).toBe("alice@mailhost.test");
    expect(input.host).toBe("wiki.example.org");
    expect(input.sourceEvidenceId).toBeUndefined();
  });
});
