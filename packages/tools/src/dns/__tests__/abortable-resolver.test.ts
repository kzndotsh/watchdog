import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { ToolsError } from "../../errors/tools-error";
import {
  assertNotAborted,
  dnsOrEmpty,
  withAbortableResolver,
} from "../abortable-resolver";

describe("abortable-resolver", () => {
  it("assertNotAborted throws when signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => {
      assertNotAborted(controller.signal, "aborted");
    }).toThrow(ToolsError);
  });

  it("withAbortableResolver throws when signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => withAbortableResolver(controller.signal, "aborted")).toThrow(
      ToolsError
    );
  });

  it("withAbortableResolver returns resolver and cleanup", () => {
    const controller = new AbortController();
    const { resolver, cleanup } = withAbortableResolver(
      controller.signal,
      "aborted"
    );

    expect(resolver).toBeDefined();
    cleanup();
    controller.abort();
  });
});

describe("dnsOrEmpty", () => {
  it("maps ENOTFOUND to the empty value", async () => {
    const result = await Effect.runPromise(
      dnsOrEmpty(
        () =>
          Promise.reject(Object.assign(new Error("nx"), { code: "ENOTFOUND" })),
        []
      )
    );
    expect(result).toEqual([]);
  });

  it("propagates non-DNS failures", async () => {
    await expect(
      Effect.runPromise(
        dnsOrEmpty(() => Promise.reject(new Error("timeout")), [])
      )
    ).rejects.toThrow("timeout");
  });
});
