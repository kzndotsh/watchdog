import { createORPCClient, ORPCError } from "@orpc/client";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { vi, type Mock } from "vitest";

import type { AppRouter } from "@watchdog/server/api";

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

type Client = RouterClient<AppRouter>;
type AnyFn = (...args: never[]) => unknown;

type ProcedurePath<T, P extends string = ""> = T extends AnyFn
  ? P
  : {
      [K in keyof T & string]: ProcedurePath<
        T[K],
        P extends "" ? K : `${P}.${K}`
      >;
    }[keyof T & string];

type ProcedureAt<T, P extends string> = P extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? ProcedureAt<T[H], R>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** The path of one procedure of the API, as written at the call site (`tasks.list`). */
export type OrpcPath = ProcedurePath<Client>;

export type OrpcInput<P extends OrpcPath> =
  ProcedureAt<Client, P> extends (input: infer I, ...rest: never[]) => unknown
    ? I
    : never;
export type OrpcOutput<P extends OrpcPath> =
  ProcedureAt<Client, P> extends (...args: never[]) => infer R
    ? Awaited<R>
    : never;

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

/**
 * Factory of `vi.mock("@/lib/orpc-client", ...)`: the real client and utils over the doubles.
 *
 * @canonical `orpcClientModuleDouble`, `procedureDouble`, `sessionInOrganization`: A screen or hook test of a domain on the oRPC client: the real client and Query utils over one `vi.fn` per procedure path (`vi.mock("@/lib/orpc-client", ...)` with `orpcClientModuleDouble`; `procedureDouble("claims.list")` receives the input; `sessionInOrganization` answers `auth.whoami`)
 */
export function orpcClientModuleDouble() {
  const orpcClient: RouterClient<AppRouter> = createORPCClient({
    call: async (path, input) => doubleAt(path.join("."))(input),
  });
  return { orpc: createTanstackQueryUtils(orpcClient) };
}

/**
 * `auth.whoami` as the API answers a session acting in `organizationId`; `null` (in no
 * organization) is the bare `FORBIDDEN` the procedure's guard raises.
 *
 *   procedureDouble("auth.whoami").mockImplementation(sessionInOrganization("org-1"));
 */
export function sessionInOrganization(organizationId: string | null) {
  return async (): Promise<OrpcOutput<"auth.whoami">> => {
    if (organizationId === null) throw new ORPCError("FORBIDDEN");
    return { credential: "session", keyId: null, scopes: [], organizationId };
  };
}
