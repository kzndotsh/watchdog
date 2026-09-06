import { describe, expect, it } from "vitest";

import {
  connectionFormIssues,
  type ConnectionFormValues,
} from "@/domains/dossier/components/ego-graph/connection-dialog";
import {
  CONFIRMED_REQUIRES_EVIDENCE,
  CONFIRMED_REQUIRES_EVIDENCE_HINT,
} from "@/shared/lib/confirmed-evidence";

const BASE: ConnectionFormValues = {
  peerId: "peer-1",
  predicate: "operates",
  orientation: "forward",
  notes: "",
  confidence: "unverified",
  evidenceIds: [],
};

describe("connectionFormIssues", () => {
  it("requires a peer entity", () => {
    expect(connectionFormIssues({ ...BASE, peerId: "" })).toContain(
      "Select a peer entity"
    );
  });

  it("requires notes for related_to edges", () => {
    expect(
      connectionFormIssues({
        ...BASE,
        predicate: "related_to",
        notes: "   ",
      })
    ).toContain("related_to needs a short why (notes)");
  });

  it("blocks confirmed confidence without evidence", () => {
    expect(
      connectionFormIssues({
        ...BASE,
        confidence: "confirmed",
        evidenceIds: [],
      })
    ).toContain(CONFIRMED_REQUIRES_EVIDENCE);
    expect(CONFIRMED_REQUIRES_EVIDENCE_HINT.length).toBeGreaterThan(10);
  });
});
