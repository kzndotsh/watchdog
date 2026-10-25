import { describe, expect, it } from "vitest";

import { testCapProvider } from "@/testing/records";

import type { CapListItem } from "../../types";
import { capInfoRows } from "../cap-info-rows";

const CAP: CapListItem = {
  id: "network.shodan.lookup",
  version: "1",
  provider: testCapProvider,
  title: "Shodan Lookup",
  kind: "collect",
  egress: ["account_lookup"],
  contacts: [{ kind: "provider", host: "api.vendor.test", access: "keyed" }],
  flags: ["needs_egress"],
  useCases: ["Passive"],
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  input: {},
  inputForm: {},
};

describe("capInfoRows", () => {
  it("title-cases cap kind, flags, and egress", () => {
    const rows = capInfoRows(CAP);
    const byLabel = new Map(rows.map((row) => [row.label, row.value]));
    expect(byLabel.get("Kind")).toBe("Collect");
    expect(byLabel.get("Flags")).toBe("Needs Egress");
    expect(byLabel.get("Egress")).toBe("Account lookups");
    expect(byLabel.get("Intent")).toBe("Passive");
    expect(byLabel.get("Consumes")).toBe("IP");
    expect(byLabel.get("Produces")).toBe("File");
  });
});
