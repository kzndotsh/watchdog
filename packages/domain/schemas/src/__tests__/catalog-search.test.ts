import { describe, expect, it } from "vitest";

import {
  catalogIdMatchesSearch,
  catalogIdSearchHaystack,
} from "../catalog-search";

describe("catalogIdSearchHaystack", () => {
  it("includes raw id and humanized spacing for capabilities", () => {
    expect(catalogIdSearchHaystack("network.shodan.lookup")).toBe(
      "network.shodan.lookup network shodan lookup"
    );
  });

  it("includes hyphenated playbook ids", () => {
    expect(catalogIdSearchHaystack("host-footprint")).toBe(
      "host-footprint host footprint"
    );
  });

  it("returns empty for blank ids", () => {
    expect(catalogIdSearchHaystack("")).toBe("");
    expect(catalogIdSearchHaystack(null)).toBe("");
  });

  it("catalogIdMatchesSearch matches humanized capability fragments", () => {
    expect(
      catalogIdMatchesSearch("network.shodan.lookup", "network shodan")
    ).toBe(true);
    expect(catalogIdMatchesSearch("host-footprint", "host footprint")).toBe(
      true
    );
    expect(catalogIdMatchesSearch("network.shodan.lookup", "missing")).toBe(
      false
    );
  });
});
