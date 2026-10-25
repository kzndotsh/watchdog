import { it as effectIt } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { breachCapsEnabled } from "../breach-caps.ts";
import {
  breachOnlyCredentialNames,
  listCapabilitiesEffect,
  listPlaybookDescriptorsEffect,
} from "../catalog.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("breachCapsEnabled", () => {
  it("is off by default", () => {
    vi.stubEnv("WD_ENABLE_BREACH_CAPS", undefined);
    expect(breachCapsEnabled()).toBe(false);
  });

  it.each(["1", "true", "yes", "on"])("is on for %s", (value) => {
    vi.stubEnv("WD_ENABLE_BREACH_CAPS", value);
    expect(breachCapsEnabled()).toBe(true);
  });

  it.each(["0", "false", "off", "", "maybe"])("is off for %j", (value) => {
    vi.stubEnv("WD_ENABLE_BREACH_CAPS", value);
    expect(breachCapsEnabled()).toBe(false);
  });
});

describe("catalog with the breach setting", () => {
  effectIt.effect(
    "marks every breach Cap and no other disabled while off",
    () =>
      Effect.gen(function* offGen() {
        vi.stubEnv("WD_ENABLE_BREACH_CAPS", "0");
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

  effectIt.effect("marks nothing once the setting is on", () =>
    Effect.gen(function* onGen() {
      vi.stubEnv("WD_ENABLE_BREACH_CAPS", "1");
      const caps = yield* listCapabilitiesEffect();
      expect(caps.some((cap) => cap.disabledReason !== undefined)).toBe(false);
      const playbooks = yield* listPlaybookDescriptorsEffect();
      expect(playbooks.some((p) => p.disabledReason !== undefined)).toBe(false);
    })
  );

  it("lists the breach provider keys, and not a key another Cap shares", () => {
    const names = breachOnlyCredentialNames();
    expect(names.has("HIBP_API_KEY")).toBe(true);
    expect(names.has("DEHASHED_API_KEY")).toBe(true);
    expect(names.has("SHODAN_API_KEY")).toBe(false);
  });
});
