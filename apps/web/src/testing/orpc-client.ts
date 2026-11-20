import { createORPCClient } from "@orpc/client";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { vi, type Mock } from "vitest";

import type { OrpcInput, OrpcOutput, OrpcPath } from "@/testing/server-fn";
import type { AppRouter } from "@watchdog/api";

/**
 * Harness for screens and hooks that call the API through `@/lib/orpc-client`: the real oRPC
 * client and TanStack Query utils (so keys, `call` and invalidation are the production ones)
 * over a link whose procedures are `vi.fn` doubles, one per path.
 *
 *   vi.mock("@/lib/orpc-client", async () =>
 *     (await import("@/testing/orpc-client")).orpcClientModuleDouble());
 *   const listClaims = procedureDouble("claims.list");
 *   listClaims.mockImplementation(memoryListProcedure(rows, { matches }));
 *   expect(lastProcedureInput(listClaims)).toEqual({ caseId, entityId });
 *
 * A procedure no test answered resolves `undefined`.
 */

type ProcedureDouble<P extends OrpcPath> = Mock<
  (input: OrpcInput<P>) => Promise<OrpcOutput<P>>
>;

type AnyDouble = Mock<(input: unknown) => Promise<unknown>>;

const doubles = new Map<string, AnyDouble>();

function doubleAt(path: string): AnyDouble {
  let double = doubles.get(path);
  if (double === undefined) {
    double = vi.fn<(input: unknown) => Promise<unknown>>();
    doubles.set(path, double);
  }
  return double;
}

/** The `vi.fn` standing in for the procedure at `path` (`claims.list`): it receives the input. */
export function procedureDouble<P extends OrpcPath>(
  path: P
): ProcedureDouble<P> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the screen calls the typed procedure at this path
  return doubleAt(path) as unknown as ProcedureDouble<P>;
}

/** Factory of `vi.mock("@/lib/orpc-client", ...)`: the real client and utils over the doubles. */
export function orpcClientModuleDouble() {
  const orpcClient: RouterClient<AppRouter> = createORPCClient({
    call: async (path, input) => doubleAt(path.join("."))(input),
  });
  return { orpcClient, orpc: createTanstackQueryUtils(orpcClient) };
}
