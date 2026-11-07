import { describe, expect, it } from "vitest";

import { isSecretCredential, listKnownCredentials } from "../known-credentials";
import { CAPABILITIES } from "../registry";
import { credentialSpecSlots } from "../sdk";

describe("listKnownCredentials", () => {
  it("lists every slot a Cap declares, once, each with a label and description", () => {
    const declared = new Set(
      CAPABILITIES.flatMap((cap) =>
        (cap.credentials ?? []).flatMap((spec) =>
          credentialSpecSlots(spec).map((slot) => slot.name)
        )
      )
    );
    const listed = listKnownCredentials();
    expect(listed.map((k) => k.name).sort()).toEqual([...declared].sort());
    for (const k of listed) {
      expect(k.label.trim(), k.name).not.toBe("");
      expect(k.description.trim(), k.name).not.toBe("");
    }
  });

  it("lists the AI provider slots the model Cap declares", () => {
    const names = listKnownCredentials().map((k) => k.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ANTHROPIC_API_KEY",
        "AI_COMPAT_API_KEY",
        "AI_COMPAT_BASE_URL",
      ])
    );
  });
});

describe("isSecretCredential", () => {
  it("treats a key, a custom slot and an unknown name as secret", () => {
    expect(isSecretCredential("SHODAN_API_KEY")).toBe(true);
    expect(isSecretCredential("MY_CUSTOM_SLOT")).toBe(true);
  });

  it("treats the OpenAI-compatible base URL as configuration, not a secret", () => {
    expect(isSecretCredential("AI_COMPAT_BASE_URL")).toBe(false);
  });
});
