import { describe, it, expect } from "vitest";

import { formatCapAvailabilityError } from "../cap-availability.ts";

describe("cap-availability", () => {
  it("formatCapAvailabilityError names the missing vault slot", () => {
    expect(
      formatCapAvailabilityError(
        { ok: false, kind: "missing_credential", names: ["SHODAN_API_KEY"] },
        "network.shodan.lookup"
      )
    ).toBe(
      "Missing credential SHODAN_API_KEY — set it in Settings before running network.shodan.lookup"
    );
    expect(
      formatCapAvailabilityError(
        {
          ok: false,
          kind: "missing_credential",
          names: ["ANTHROPIC_API_KEY", "AI_COMPAT_API_KEY"],
        },
        "evidence.extract.ai"
      )
    ).toMatch(/ANTHROPIC_API_KEY \| AI_COMPAT_API_KEY/);
  });

  it("formatCapAvailabilityError names the blocked classes and where the seed would go", () => {
    const reason = formatCapAvailabilityError(
      {
        ok: false,
        kind: "egress_blocked",
        capabilityId: "network.shodan.lookup",
        classes: ["account_lookup"],
        destinations: ["api.shodan.io"],
      },
      "network.shodan.lookup"
    );
    expect(reason).toContain("Account lookups");
    expect(reason).toContain("api.shodan.io");
    expect(reason).toContain("owner or admin");
  });

  it("formatCapAvailabilityError names the setting for a disabled breach Cap", () => {
    const message = formatCapAvailabilityError(
      {
        ok: false,
        kind: "breach_disabled",
        capabilityId: "breach.hibp.lookup",
      },
      "breach.hibp.lookup"
    );
    expect(message).toMatch(/WD_BREACH_CAPS=safe/);
    expect(message).toMatch(/breach\.hibp\.lookup$/);
  });
});
