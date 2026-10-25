import { describe, expect, it, vi } from "vitest";

import { createSafeLookup } from "../outbound-policy";

const PUBLIC = [{ address: "203.0.113.7", family: 4 as const }];

/** Lets the detached lookup and any rejection it leaves settle. */
const tick = async () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
const settle = async () => {
  await tick();
  await tick();
  await tick();
};

describe("createSafeLookup", () => {
  it("answers with the validated addresses", async () => {
    const lookup = createSafeLookup(
      async () => PUBLIC,
      () => false
    );
    const callback = vi.fn();
    lookup("example.test", {}, callback);
    await settle();
    expect(callback).toHaveBeenCalledExactlyOnceWith(null, "203.0.113.7", 4);
  });

  it("hands a blocked resolution to the callback as an Error", async () => {
    const lookup = createSafeLookup(
      async () => PUBLIC,
      () => true
    );
    const callback = vi.fn();
    lookup("example.test", {}, callback);
    await settle();
    expect(callback).toHaveBeenCalledExactlyOnceWith(expect.any(Error), "", 0);
  });

  it("leaves no unhandled rejection when the callback throws", async () => {
    const lookup = createSafeLookup(
      async () => PUBLIC,
      () => false
    );
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onRejection);
    try {
      const callback = vi.fn(() => {
        throw new Error("callback bug");
      });
      lookup("example.test", {}, callback);
      await settle();
      // Told once more with the error it threw; the second throw is swallowed.
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: "callback bug" }),
        "",
        0
      );
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });
});
