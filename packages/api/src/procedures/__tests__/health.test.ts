import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { health } from "../health";

describe("health procedure", () => {
  it("returns the public health payload", async () => {
    const caller = createRouterClient(health, {
      context: { headers: new Headers(), actor: null },
    });

    await expect(caller()).resolves.toEqual({
      ok: true,
      service: "watchdog",
    });
  });
});
