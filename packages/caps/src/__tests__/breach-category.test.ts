import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  checkCapabilityAvailability,
  checkPlaybookAvailability,
  isBreachCap,
  listCapabilities,
  requireCapability,
  requirePlaybook,
  toCapMetadata,
  toPlaybookDescriptor,
} from "../index";

const OPEN = {
  hasCredential: () => true,
  allowThirdPartyEgress: true,
};

describe("breach category", () => {
  it("identifies exactly the Caps under breach/ and flags only those", () => {
    const breach = CAPABILITIES.filter((cap) => isBreachCap(cap)).map(
      (cap) => cap.id
    );
    expect([...breach].sort()).toEqual([
      "breach.dehashed.lookup",
      "breach.hibp.lookup",
      "breach.hudsonrock.lookup",
      "breach.snusbase.lookup",
    ]);
    for (const desc of listCapabilities()) {
      expect(desc.flags?.includes("breach") ?? false).toBe(
        desc.id.startsWith("breach.")
      );
    }
  });

  it("is not fooled by an id that merely contains the word", () => {
    expect(isBreachCap({ id: "identity.breach.lookup" })).toBe(false);
    expect(isBreachCap({ id: "breachy.lookup" })).toBe(false);
    expect(isBreachCap({ id: "breach.x.lookup" })).toBe(true);
  });

  it("reports a breach Cap unavailable while the setting is off, before anything else", () => {
    const requires = toCapMetadata(requireCapability("breach.hibp.lookup"));
    expect(
      checkCapabilityAvailability(
        { credentials: [], egress: "third_party", flags: requires.flags ?? [] },
        {
          ...OPEN,
          hasCredential: () => false,
          allowThirdPartyEgress: false,
          breachCapsEnabled: false,
          breachCapabilityId: "breach.hibp.lookup",
        }
      )
    ).toEqual({
      ok: false,
      kind: "breach_disabled",
      capabilityId: "breach.hibp.lookup",
    });
  });

  it("lets a breach Cap through once the setting is on", () => {
    expect(
      checkCapabilityAvailability(
        { credentials: [], egress: "third_party", flags: ["breach"] },
        { ...OPEN, breachCapsEnabled: true }
      )
    ).toEqual({ ok: true });
  });

  it.each(["email-breach", "email-corpus"])(
    "keeps the %s Playbook from starting while the setting is off",
    (id) => {
      const { requires } = toPlaybookDescriptor(requirePlaybook(id));
      expect(requires.flags).toContain("breach");
      expect(
        checkPlaybookAvailability(requires, {
          ...OPEN,
          breachCapsEnabled: false,
        })
      ).toMatchObject({ ok: false, kind: "breach_disabled" });
      expect(
        checkPlaybookAvailability(requires, {
          ...OPEN,
          breachCapsEnabled: true,
        })
      ).toEqual({ ok: true });
    }
  );

  it("leaves a Playbook without a breach step alone", () => {
    const { requires } = toPlaybookDescriptor(requirePlaybook("hash-malware"));
    expect(requires.flags).not.toContain("breach");
    expect(
      checkPlaybookAvailability(requires, {
        ...OPEN,
        breachCapsEnabled: false,
      })
    ).toEqual({ ok: true });
  });
});
