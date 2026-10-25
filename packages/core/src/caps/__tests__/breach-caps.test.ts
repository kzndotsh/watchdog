import { it as effectIt } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { capVersion } from "@watchdog/caps";

import {
  breachCapsEnabled,
  breachCapsMode,
  credentialModeOfVersion,
  stampedCapVersion,
} from "../breach-caps.ts";
import {
  breachOnlyCredentialNames,
  listCapabilitiesEffect,
  listPlaybookDescriptorsEffect,
} from "../catalog.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("breachCapsMode", () => {
  it("is off by default", () => {
    vi.stubEnv("WD_BREACH_CAPS", undefined);
    expect(breachCapsMode()).toBe("off");
    expect(breachCapsEnabled()).toBe(false);
  });

  it.each(["off", "safe", "full"] as const)("reads %s", (value) => {
    vi.stubEnv("WD_BREACH_CAPS", value);
    expect(breachCapsMode()).toBe(value);
    expect(breachCapsEnabled()).toBe(value !== "off");
  });

  it.each(["1", "true", "on", "FULL", "", "maybe"])(
    "treats %j as off, so a typo never turns a breach Cap on",
    (value) => {
      vi.stubEnv("WD_BREACH_CAPS", value);
      expect(breachCapsMode()).toBe("off");
      expect(breachCapsEnabled()).toBe(false);
    }
  );
});

describe("stampedCapVersion", () => {
  it("carries the mode for a breach Cap, so the result cache never crosses modes", () => {
    const safe = stampedCapVersion("breach.dehashed.lookup", "safe");
    const full = stampedCapVersion("breach.dehashed.lookup", "full");
    expect(safe).not.toBe(full);
    expect(safe.startsWith(capVersion("breach.dehashed.lookup"))).toBe(true);
    expect(credentialModeOfVersion(safe)).toBe("safe");
    expect(credentialModeOfVersion(full)).toBe("full");
  });

  it("leaves any other Cap's version alone", () => {
    expect(stampedCapVersion("network.dns.lookup", "full")).toBe(
      capVersion("network.dns.lookup")
    );
  });

  it("reads a version with no mode as safe", () => {
    expect(credentialModeOfVersion("abc123")).toBe("safe");
  });
});

describe("catalog with the breach setting", () => {
  effectIt.effect(
    "marks every breach Cap and no other disabled while off",
    () =>
      Effect.gen(function* offGen() {
        vi.stubEnv("WD_BREACH_CAPS", "off");
        const caps = yield* listCapabilitiesEffect();
        const disabled = caps
          .filter((cap) => cap.disabledReason === "breach_disabled")
          .map((cap) => cap.id)
          .sort();
        expect(disabled).toEqual([
          "breach.dehashed.lookup",
          "breach.hibp.lookup",
          "breach.hudsonrock.lookup",
          "breach.leakradar.lookup",
          "breach.snusbase.lookup",
        ]);
        const playbooks = yield* listPlaybookDescriptorsEffect();
        expect(
          playbooks
            .filter((p) => p.disabledReason === "breach_disabled")
            .map((p) => p.id)
            .sort()
        ).toEqual(["email-breach", "email-corpus"]);
      })
  );

  for (const mode of ["safe", "full"]) {
    effectIt.effect(`marks nothing in ${mode} mode`, () =>
      Effect.gen(function* onGen() {
        vi.stubEnv("WD_BREACH_CAPS", mode);
        const caps = yield* listCapabilitiesEffect();
        expect(caps.some((cap) => cap.disabledReason !== undefined)).toBe(
          false
        );
        const playbooks = yield* listPlaybookDescriptorsEffect();
        expect(playbooks.some((p) => p.disabledReason !== undefined)).toBe(
          false
        );
      })
    );
  }

  it("lists the breach provider keys, and not a key another Cap shares", () => {
    const names = breachOnlyCredentialNames();
    expect(names.has("HIBP_API_KEY")).toBe(true);
    expect(names.has("DEHASHED_API_KEY")).toBe(true);
    expect(names.has("SHODAN_API_KEY")).toBe(false);
  });
});
