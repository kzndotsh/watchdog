import { describe, expect, it } from "vitest";

import { titleCase } from "../title-case";

describe("titleCase", () => {
  it("title-cases dotted capability tails with acronym preservation", () => {
    expect(titleCase("dns lookup")).toBe("DNS Lookup");
    expect(titleCase("shodan lookup")).toBe("Shodan Lookup");
  });

  it("title-cases hyphenated playbook ids", () => {
    expect(titleCase("host-footprint-lite")).toBe("Host Footprint Lite");
  });
});
