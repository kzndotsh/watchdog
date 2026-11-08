import { describe, expect, it } from "vitest";

import { graphWriteResultSchema } from "@watchdog/schemas/graph";

import { credentialSlotSchema } from "../schemas";

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
