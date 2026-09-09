import { describe, it, expect } from "vitest";

import {
  EDGE_PREDICATES,
  EDGE_PREDICATE_META,
  edgePredicateAllowsKinds,
  edgeRelatedToHasNotes,
  isEdgePredicate,
  parseEdgePhraseValue,
  predicateLabel,
  resolveEdgeEndpoints,
} from "../vocab.ts";

describe("edge-predicate-meta", () => {
  it("EDGE_PREDICATE_META covers every EDGE_PREDICATES member", () => {
    for (const predicate of EDGE_PREDICATES) {
      expect(EDGE_PREDICATE_META[predicate]).toBeTruthy();
      expect(EDGE_PREDICATE_META[predicate].label.length > 0).toBeTruthy();
      expect(
        EDGE_PREDICATE_META[predicate].inverseLabel.length > 0
      ).toBeTruthy();
      expect(EDGE_PREDICATE_META[predicate].group.length > 0).toBeTruthy();
    }
  });

  it("EDGE_PREDICATE_META uses Opus semantic groups", () => {
    expect(EDGE_PREDICATE_META.parent_of.group).toBe("ownership_control");
    expect(EDGE_PREDICATE_META.owns.group).toBe("ownership_control");
    expect(EDGE_PREDICATE_META.leads.group).toBe("roles_affiliation");
    expect(EDGE_PREDICATE_META.founded.group).toBe("roles_affiliation");
    expect(EDGE_PREDICATE_META.member_of.group).toBe("roles_affiliation");
    expect(EDGE_PREDICATE_META.employee_of.group).toBe("roles_affiliation");
    expect(EDGE_PREDICATE_META.same_as.group).toBe("identity");
    expect(EDGE_PREDICATE_META.primary_domain.group).toBe("domains_hosting");
    expect(EDGE_PREDICATE_META.registers.group).toBe("registration_services");
    expect(EDGE_PREDICATE_META.related_to.group).toBe("other");
  });

  it("EDGE_PREDICATES includes hosted_on with Hosts inverse", () => {
    expect(isEdgePredicate("hosted_on")).toBe(true);
    expect(EDGE_PREDICATE_META.hosted_on.inverseLabel).toBe("Hosts");
  });

  it("symmetric predicates share label and inverseLabel", () => {
    for (const predicate of EDGE_PREDICATES) {
      const meta = EDGE_PREDICATE_META[predicate];
      if (meta.symmetric) {
        expect(meta.inverseLabel).toBe(meta.label);
      }
    }
  });

  it("predicateLabel returns canonical outbound labels", () => {
    expect(predicateLabel("operates", "out")).toBe("Operates");
    expect(predicateLabel("hosted_on", "out")).toBe("Hosted on");
  });

  it("predicateLabel returns inverse inbound labels", () => {
    expect(predicateLabel("operates", "in")).toBe("Operated by");
    expect(predicateLabel("hosted_on", "in")).toBe("Hosts");
    expect(predicateLabel("parent_of", "in")).toBe("Child of");
  });

  it("predicateLabel keeps symmetric labels identical both ways", () => {
    expect(predicateLabel("same_as", "out")).toBe("Same as");
    expect(predicateLabel("same_as", "in")).toBe("Same as");
    expect(predicateLabel("shares_ip_with", "in")).toBe("Shares IP with");
  });

  it("predicateLabel defaults direction to out", () => {
    expect(predicateLabel("dns_via")).toBe("DNS via");
  });

  it("predicateLabel passes through unknown predicates", () => {
    expect(predicateLabel("not_a_real_pred", "in")).toBe("not_a_real_pred");
  });

  it("edgePredicateAllowsKinds allows any when validKinds empty", () => {
    expect(edgePredicateAllowsKinds("related_to", "person", "infra")).toBe(
      true
    );
  });

  it("edgeRelatedToHasNotes requires notes for related_to", () => {
    expect(edgeRelatedToHasNotes({ predicate: "related_to" })).toBe(false);
    expect(
      edgeRelatedToHasNotes({ predicate: "related_to", notes: "linked" })
    ).toBe(true);
    expect(edgeRelatedToHasNotes({ predicate: "same_as" })).toBe(true);
  });

  it("hosted_on allows infra as dependent only", () => {
    expect(edgePredicateAllowsKinds("hosted_on", "infra", "infra")).toBe(true);
    expect(edgePredicateAllowsKinds("hosted_on", "infra", "person")).toBe(true);
    expect(edgePredicateAllowsKinds("hosted_on", "person", "infra")).toBe(
      false
    );
    expect(edgePredicateAllowsKinds("hosted_on", "org", "infra")).toBe(false);
  });

  it("employee_of allows person to org only", () => {
    expect(edgePredicateAllowsKinds("employee_of", "person", "org")).toBe(true);
    expect(edgePredicateAllowsKinds("employee_of", "person", "person")).toBe(
      false
    );
    expect(edgePredicateAllowsKinds("employee_of", "org", "org")).toBe(false);
    expect(predicateLabel("employee_of", "in")).toBe("Employs");
  });

  it("edgePredicateAllowsKinds rejects invalid pairs", () => {
    expect(edgePredicateAllowsKinds("dns_via", "person", "person")).toBe(false);
    expect(edgePredicateAllowsKinds("dns_via", "infra", "infra")).toBe(true);
    expect(edgePredicateAllowsKinds("primary_domain", "org", "infra")).toBe(
      true
    );
    expect(edgePredicateAllowsKinds("primary_domain", "person", "infra")).toBe(
      false
    );
  });

  it("parseEdgePhraseValue parses and rejects junk", () => {
    expect(parseEdgePhraseValue("hosted_on:inverse")).toEqual({
      predicate: "hosted_on",
      orientation: "inverse",
    });
    expect(parseEdgePhraseValue("nope")).toBe(null);
    expect(parseEdgePhraseValue("operates:sideways")).toBe(null);
    expect(parseEdgePhraseValue("  HOSTED_ON : inverse ")).toEqual({
      predicate: "hosted_on",
      orientation: "inverse",
    });
  });

  it("resolveEdgeEndpoints maps orientation and preserves symmetric storage", () => {
    expect(
      resolveEdgeEndpoints({
        entityId: "a",
        peerId: "b",
        predicate: "operates",
        orientation: "forward",
      })
    ).toEqual({ fromId: "a", toId: "b" });
    expect(
      resolveEdgeEndpoints({
        entityId: "a",
        peerId: "b",
        predicate: "operates",
        orientation: "inverse",
      })
    ).toEqual({ fromId: "b", toId: "a" });
    expect(
      resolveEdgeEndpoints({
        entityId: "a",
        peerId: "b",
        predicate: "same_as",
        orientation: "forward",
        existing: { fromId: "b", toId: "a", peerId: "b" },
      })
    ).toEqual({ fromId: "b", toId: "a" });
    expect(
      resolveEdgeEndpoints({
        entityId: " a ",
        peerId: " b ",
        predicate: "operates",
        orientation: "forward",
      })
    ).toEqual({ fromId: "a", toId: "b" });
  });
});
