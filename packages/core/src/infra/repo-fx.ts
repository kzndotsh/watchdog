import { Effect } from "effect";

import type { DbExec } from "@watchdog/db";

import { Db } from "./db-service";
import { tryDb } from "./postgres-effect";
import type { DomainTag } from "./tagged-errors";

/** A repo module: async methods taking the `exec` handle first (the `packages/db` rules). */
type RepoModule = Record<
  string,
  (exec: DbExec, ...args: never[]) => Promise<unknown>
>;

/** A module whose methods take `exec` first and return an Effect. */
type FxModule = Record<
  string,
  (exec: DbExec, ...args: never[]) => Effect.Effect<unknown, DomainTag>
>;

/**
 * Each method of `R` with the same arguments and an `Effect` result: the promise's value, or a
 * `DomainTag` (`mapPostgresCatch`; what it cannot map stays a defect, as in `tryDb`).
 *
 * The mapping reads each method's parameters with `infer`, so optional arguments and labels
 * survive, but a generic method loses its type parameters (they widen to their constraints) and
 * an overloaded one keeps only its last signature. Write such a method by hand beside the
 * module; none exists in a repo today.
 */
export type RepoFx<R extends RepoModule> = {
  readonly [K in keyof R]: R[K] extends (
    exec: DbExec,
    ...args: infer A
  ) => Promise<infer T>
    ? (exec: DbExec, ...args: A) => Effect.Effect<T, DomainTag>
    : never;
};

/** `RepoFx` on the pool: no `exec` argument; the `Db` service supplies it (`R = Db`). */
export type RepoFxDb<F extends FxModule> = {
  readonly [K in keyof F]: F[K] extends (
    exec: DbExec,
    ...args: infer A
  ) => Effect.Effect<infer T, infer E>
    ? (...args: A) => Effect.Effect<T, E, Db>
    : never;
};

/** A module whose methods are made on first read, so none is touched at import. */
function lazyModule(make: (name: string) => unknown): Record<string, unknown> {
  const made = new Map<string, unknown>();
  const target: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, name) {
        if (typeof name !== "string") return;
        let method = made.get(name);
        if (method === undefined) {
          method = make(name);
          made.set(name, method);
        }
        return method;
      },
    }
  );
  return target;
}

/**
 * Turn a repo module into an Effect module with the transaction handle still explicit:
 * `jobsRepoFx.get(tx, id)` is `tryDb(() => jobsRepo.get(tx, id))`. The call is lazy (it runs
 * when the Effect does) and timed like any `tryDb`.
 *
 * The module is passed as a thunk and each method is looked up on it per call, so importing
 * this file reads no repo (a test's partial `vi.mock("@watchdog/db")` need only supply the
 * repos it calls) and a `vi.spyOn(repo, "m")` sees the call.
 */
export function repoFx<R extends RepoModule>(repo: () => R): RepoFx<R> {
  const methods = lazyModule(
    (name) =>
      (exec: DbExec, ...args: never[]) =>
        tryDb(() => repo()[name](exec, ...args))
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mapped type is the contract; each name yields a method of its shape
  return methods as RepoFx<R>;
}

/**
 * The pool view of a `repoFx` module: `jobsRepoFxDb.get(id)` reads the client from the `Db`
 * service. A transaction body does not use it: it passes its `tx` to the explicit view.
 */
export function repoFxDb<F extends FxModule>(fx: F): RepoFxDb<F> {
  const methods = lazyModule(
    (name) =>
      (...args: never[]) =>
        Effect.flatMap(Effect.service(Db), (exec) => fx[name](exec, ...args))
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mapped type is the contract; each name yields a method of its shape
  return methods as RepoFxDb<F>;
}
