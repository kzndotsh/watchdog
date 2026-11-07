import { ORPCError, type RouterClient } from "@orpc/server";

import { orpcNullIfNotFound } from "@/lib/orpc-null-if-not-found";
import type { AppRouter } from "@watchdog/api";

/**
 * Harness for `*.functions.ts` tests: the server function runs for real (its `validator` schema
 * and its handler); only the two edges are faked. `serverFnModuleDouble` replaces
 * `createServerFn`, and `orpcServerModuleDouble` replaces `@/lib/orpc.server` with a fake oRPC
 * client (`orpc`) in front of which the real `orpcNullIfNotFound` still runs. A test then asserts
 * what the server function owns: which input it refuses, how it maps input to the API call, and
 * how it maps the API's answer or error to its result.
 *
 *   vi.mock("@tanstack/react-start", async () =>
 *     (await import("@/testing/server-fn")).serverFnModuleDouble());
 *   vi.mock("@/lib/orpc.server", async () =>
 *     (await import("@/testing/server-fn")).orpcServerModuleDouble());
 *   beforeEach(() => orpc.reset());
 *   orpc.reply("tasks.list", page);
 *   await callServerFn(listTasksPageFn, { caseId });
 *   expect(orpc.calls("tasks.list")).toEqual([{ caseId }]);
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

type OrpcInput<P extends OrpcPath> =
  ProcedureAt<Client, P> extends (input: infer I, ...rest: never[]) => unknown
    ? I
    : never;
type OrpcOutput<P extends OrpcPath> =
  ProcedureAt<Client, P> extends (...args: never[]) => infer R
    ? Awaited<R>
    : never;

type Responder = (input: unknown) => unknown;

export type FakeOrpc = ReturnType<typeof createFakeOrpc>;

// A Proxy only traps `apply` on a function target.
const callable = (): undefined => undefined;

function createFakeOrpc() {
  const responders = new Map<string, Responder>();
  const calls = new Map<string, unknown[]>();

  const node = (path: readonly string[]): unknown =>
    new Proxy(callable, {
      get: (_target, key) =>
        typeof key === "string" ? node([...path, key]) : undefined,
      apply: async (_target, _this, args: unknown[]) => {
        const name = path.join(".");
        calls.set(name, [...(calls.get(name) ?? []), args[0]]);
        const respond = responders.get(name);
        if (!respond) throw new Error(`No fake oRPC reply for ${name}`);
        return respond(args[0]);
      },
    });

  return {
    client: node([]),
    /** The procedure answers with `value`. */
    reply<P extends OrpcPath>(path: P, value: OrpcOutput<P>): void {
      responders.set(path, () => value);
    },
    /** The procedure answers by computing from its input. */
    replyWith<P extends OrpcPath>(
      path: P,
      respond: (input: OrpcInput<P>) => OrpcOutput<P>
    ): void {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the server function called the typed procedure
      responders.set(path, (input) => respond(input as OrpcInput<P>));
    },
    /** The procedure rejects with `error` (an `ORPCError`, or anything else the API could throw). */
    fail(path: OrpcPath, error: unknown): void {
      responders.set(path, () => {
        throw error;
      });
    },
    /** Every input the procedure received, in order. */
    calls<P extends OrpcPath>(path: P): OrpcInput<P>[] {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fake records what the typed procedure received
      return (calls.get(path) ?? []) as OrpcInput<P>[];
    },
    reset(): void {
      responders.clear();
      calls.clear();
    },
  };
}

export const orpc = createFakeOrpc();

/** An oRPC NOT_FOUND, as the API raises it for a missing record. */
export const orpcNotFound = (): ORPCError<"NOT_FOUND", unknown> =>
  new ORPCError("NOT_FOUND");

type Validator = { parse: (value: unknown) => unknown };
type Handler = (options: { data?: unknown; context: unknown }) => unknown;
type Run = (data: unknown, context: unknown) => unknown;

const runners = new Map<unknown, Run>();

function serverFnOf(handler: Handler, validator?: Validator) {
  const run: Run = (data, context) =>
    handler({
      context: context ?? {},
      data: validator ? validator.parse(data) : data,
    });
  const serverFn = (options: { data?: unknown; context?: unknown } = {}) =>
    run(options.data, options.context);
  runners.set(serverFn, run);
  return serverFn;
}

/** Factory of `vi.mock("@tanstack/react-start", ...)`: `createServerFn` that keeps the real validator and handler. */
export function serverFnModuleDouble() {
  return {
    createServerFn: () => ({
      handler: (handler: Handler) => serverFnOf(handler),
      validator: (validator: Validator) => ({
        handler: (handler: Handler) => serverFnOf(handler, validator),
      }),
    }),
  };
}

/** Factory of `vi.mock("@/lib/orpc.server", ...)`: the fake client, the real `orpcNullIfNotFound`. */
export function orpcServerModuleDouble() {
  return { orpcFromContext: () => orpc.client, orpcNullIfNotFound };
}

/**
 * Runs a server function through the harness. `input` is `unknown` on purpose: a test of a
 * refused value passes it as is, and the function's own validator is what judges it.
 * `context` is what the auth middleware would have put on the request (`session`, `organizationId`).
 */
export async function callServerFn<F extends AnyFn>(
  serverFn: F,
  input?: unknown,
  context?: unknown
): Promise<Awaited<ReturnType<F>>> {
  const run = runners.get(serverFn);
  if (!run)
    throw new Error("Not a server function made by serverFnModuleDouble");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the handler's return type is the server function's declared one
  return (await run(input, context)) as Awaited<ReturnType<F>>;
}
