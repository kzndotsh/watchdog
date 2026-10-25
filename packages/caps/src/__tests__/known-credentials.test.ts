import { describe, expect, it } from "vitest";

import { isSecretCredential } from "../known-credentials";

describe("isSecretCredential", () => {
  it("treats a key, a custom slot and an unknown name as secret", () => {
    expect(isSecretCredential("SHODAN_API_KEY")).toBe(true);
    expect(isSecretCredential("MY_CUSTOM_SLOT")).toBe(true);
  });

  it("treats the OpenAI-compatible base URL as configuration, not a secret", () => {
    expect(isSecretCredential("AI_COMPAT_BASE_URL")).toBe(false);
  });
});
