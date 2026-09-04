import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ValidationVendorError } from "@watchdog/tools";

import {
  DEFAULT_CAP_TIMEOUT_MS,
  capTimeoutMs,
  defineCapability,
} from "../define";
import { toCapDescriptor } from "../descriptor";
import { runCap } from "../run";

const input = z.object({});

describe("defineCapability", () => {
  it("rejects empty id", () => {
    expect(() =>
      defineCapability({
        id: "",
        title: "Test",
        input,
        run: () => Effect.succeed({ artifacts: [] }),
      })
    ).toThrow(/id is required/);
  });

  it("rejects empty title", () => {
    expect(() =>
      defineCapability({
        id: "test.cap",
        title: "",
        input,
        run: () => Effect.succeed({ artifacts: [] }),
      })
    ).toThrow(/title is required/);
  });

  it("returns the same object with id and title", () => {
    const def = {
      id: "test.cap",
      title: "Test",
      input,
      run: () => Effect.succeed({ artifacts: [] }),
    };
    const cap = defineCapability(def);
    expect(cap).toBe(def);
    expect(cap.id).toBe("test.cap");
    expect(cap.title).toBe("Test");
  });
});

describe("capTimeoutMs", () => {
  it("uses DEFAULT when timeoutMs is omitted", () => {
    expect(capTimeoutMs({})).toBe(DEFAULT_CAP_TIMEOUT_MS);
  });

  it("uses the declared timeoutMs", () => {
    expect(capTimeoutMs({ timeoutMs: 12_000 })).toBe(12_000);
  });
});

describe("toCapDescriptor", () => {
  it("lands credential slots and timeoutMs on the descriptor", () => {
    const cap = defineCapability({
      id: "test.cred",
      title: "Cred",
      input,
      timeoutMs: 9000,
      credentials: [{ name: "SHODAN_API_KEY" }],
      run: () => Effect.succeed({ artifacts: [] }),
    });
    const descriptor = toCapDescriptor(cap);
    expect(descriptor.timeoutMs).toBe(9000);
    expect(descriptor.credentials).toEqual([{ name: "SHODAN_API_KEY" }]);
  });
});

describe("runCap", () => {
  it("returns artifacts from a succeeding Effect", async () => {
    const result = await runCap(Effect.succeed({ artifacts: [] }));
    expect(result.artifacts).toEqual([]);
  });

  it("maps ValidationVendorError to a ToolsError message", async () => {
    await expect(
      runCap(Effect.fail(new ValidationVendorError({ message: "no bytes" })))
    ).rejects.toThrow(/no bytes/);
  });
});
