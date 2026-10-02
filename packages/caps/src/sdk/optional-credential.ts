import { Effect } from "effect";

import type { ToolsTag } from "@watchdog/tools";

import type { CapContext } from "./define";

/** Optional vault slot — undefined when unset, still fails on decrypt errors. */
export function optionalCapCredential(
  ctx: Pick<CapContext<unknown>, "hasCredential" | "getCredential">,
  name: string
): Effect.Effect<string | undefined, ToolsTag> {
  return Effect.gen(function* optionalCapCredentialGen() {
    const present = yield* ctx.hasCredential(name);
    if (!present) {
      const missing: string | undefined = undefined;
      return missing;
    }
    return yield* ctx.getCredential(name);
  });
}
