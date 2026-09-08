import { describe, expect, it } from "vitest";

import { playbookLabel } from "@/shared/ui/vocab/playbook";

describe("playbookLabel", () => {
  it("prefers catalog title", () => {
    expect(playbookLabel("domain-sweep", "Domain footprint")).toBe(
      "Domain footprint"
    );
  });

  it("title-cases hyphenated ids", () => {
    expect(playbookLabel("domain-sweep")).toBe("Domain Sweep");
  });

  it("returns Playbook for run-id UUID fallbacks", () => {
    expect(playbookLabel("00000000-0000-4000-8000-000000000001")).toBe(
      "Playbook"
    );
  });
});
