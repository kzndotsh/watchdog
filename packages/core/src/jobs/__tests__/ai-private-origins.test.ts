import { describe, expect, it, vi } from "vitest";

const { fakeEnv } = vi.hoisted(() => ({
  fakeEnv: { WD_AI_PRIVATE_ORIGINS: undefined as unknown },
}));

vi.mock("@watchdog/env/server", () => ({ env: fakeEnv }));

import { aiPrivateOrigins } from "../ai-private-origins";

function withSetting(value: unknown, check: () => void) {
  const before = fakeEnv.WD_AI_PRIVATE_ORIGINS;
  fakeEnv.WD_AI_PRIVATE_ORIGINS = value;
  try {
    check();
  } finally {
    fakeEnv.WD_AI_PRIVATE_ORIGINS = before;
  }
}

describe("aiPrivateOrigins", () => {
  it("falls back to the local model address when the setting is absent", () => {
    withSetting(undefined, () => {
      expect(aiPrivateOrigins()).toEqual(["http://127.0.0.1:8080"]);
    });
  });

  it("reads the operator's list as normalized origins, and none as empty", () => {
    withSetting("http://10.0.0.5:9000, https://llm.lan", () => {
      expect(aiPrivateOrigins()).toEqual([
        "http://10.0.0.5:9000",
        "https://llm.lan",
      ]);
    });
    withSetting("none", () => {
      expect(aiPrivateOrigins()).toEqual([]);
    });
  });

  it("lists nothing for an unparsable value, so a bad setting never widens access", () => {
    withSetting("http://10.0.0.5/v1", () => {
      expect(aiPrivateOrigins()).toEqual([]);
    });
  });
});
