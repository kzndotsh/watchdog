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

  it("formatCapAvailabilityError names egress block", () => {
    expect(
      formatCapAvailabilityError(
        {
          ok: false,
          kind: "egress_blocked",
          capabilityId: "evidence.extract.ai",
        },
        "evidence.extract.ai"
      )
    ).toMatch(/third-party egress/);
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
    expect(message).toMatch(/WD_ENABLE_BREACH_CAPS=1/);
    expect(message).toMatch(/breach\.hibp\.lookup$/);
  });
});
