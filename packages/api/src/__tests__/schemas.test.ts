import { describe, expect, it } from "vitest";

import {
  claimSchema,
  credentialSlotSchema,
  graphWriteResultSchema,
} from "../schemas";

const claim = {
  id: "00000000-0000-4000-8000-000000000010",
  entityId: "00000000-0000-4000-8000-000000000011",
  class: "observation",
  text: "Observed handle",
  confidence: "unverified",
  retracted: false,
  retractKind: null,
  retractedReason: null,
  retractedBy: null,
  retractedAt: null,
  evidenceIds: [],
  version: 1,
};

const graphWriteResult = {
  writeId: "00000000-0000-4000-8000-000000000099",
  confidence: "unverified",
  opCount: 1,
  replayed: false,
  actorLabel: "analyst",
};

const credentialSlot = {
  name: "AI_COMPAT_API_KEY",
  label: "AI",
  description: "Compat key",
  configured: true,
  updatedAt: null,
  breachDisabled: false,
};

describe("claimSchema", () => {
  it("returns the wire shape of a claim unchanged", () => {
    expect(claimSchema.parse(claim)).toEqual(claim);
  });

  it("rejects an unknown confidence tier", () => {
    expect(
      claimSchema.safeParse({ ...claim, confidence: "certain" }).success
    ).toBe(false);
  });

  it("rejects a version that is not positive", () => {
    expect(claimSchema.safeParse({ ...claim, version: 0 }).success).toBe(false);
  });
});

describe("graphWriteResultSchema", () => {
  it("returns the wire shape of a graph write unchanged", () => {
    expect(graphWriteResultSchema.parse(graphWriteResult)).toEqual(
      graphWriteResult
    );
  });

  it("rejects a write reported as anything but unverified", () => {
    expect(
      graphWriteResultSchema.safeParse({
        ...graphWriteResult,
        confidence: "confirmed",
      }).success
    ).toBe(false);
  });
});

describe("credentialSlotSchema", () => {
  it("returns slot metadata unchanged", () => {
    expect(credentialSlotSchema.parse(credentialSlot)).toEqual(credentialSlot);
  });

  it("drops a secret value that rides along with the slot", () => {
    expect(
      credentialSlotSchema.parse({ ...credentialSlot, value: "sk-secret" })
    ).toEqual(credentialSlot);
  });

  it("rejects a slot with no name", () => {
    const { name: _name, ...nameless } = credentialSlot;
    expect(credentialSlotSchema.safeParse(nameless).success).toBe(false);
  });
});
