import type { Effect } from "effect";
import { describe, expectTypeOf, it } from "vitest";

import type { DbExec, JobRow, NewJob } from "@watchdog/db";

import type { Db } from "../db-service";
import type { RepoFx, RepoFxDb } from "../repo-fx";
import type { jobsRepoFx, jobsRepoFxDb } from "../repos-fx";
import type { DomainTag } from "../tagged-errors";

const fakeRepo = {
  async plain(_exec: DbExec, _id: string): Promise<{ id: string } | null> {
    return null;
  },
  async optional(
    _exec: DbExec,
    _id: string,
    _opts?: { limit?: number }
  ): Promise<number> {
    return 0;
  },
  async rest(_exec: DbExec, ..._ids: string[]): Promise<string[]> {
    return [];
  },
  async none(_exec: DbExec): Promise<void> {},
  async generic<T extends { id: string }>(_exec: DbExec, row: T): Promise<T> {
    return row;
  },
};
type Fx = RepoFx<typeof fakeRepo>;
type FxDb = RepoFxDb<Fx>;

describe("RepoFx", () => {
  it("keeps a plain method's arguments and returns an Effect over its value", () => {
    expectTypeOf<Fx["plain"]>().toEqualTypeOf<
      (
        exec: DbExec,
        id: string
      ) => Effect.Effect<{ id: string } | null, DomainTag>
    >();
  });

  it("keeps an optional argument optional", () => {
    expectTypeOf<Fx["optional"]>().toEqualTypeOf<
      (
        exec: DbExec,
        id: string,
        opts?: { limit?: number }
      ) => Effect.Effect<number, DomainTag>
    >();
    expectTypeOf<Fx["optional"]>().toBeCallableWith({} as DbExec, "a");
  });

  it("keeps rest arguments and a void result", () => {
    expectTypeOf<Fx["rest"]>().parameters.toEqualTypeOf<
      [exec: DbExec, ...ids: string[]]
    >();
    expectTypeOf<Fx["none"]>().returns.toEqualTypeOf<
      Effect.Effect<void, DomainTag>
    >();
  });

  it("types its arguments as the repo does, so a wrong one is an error", () => {
    expectTypeOf<Fx["plain"]>().parameters.toEqualTypeOf<
      [exec: DbExec, id: string]
    >();
  });

  it("widens a generic method to its constraint: such a method is hand-wrapped", () => {
    expectTypeOf<Fx["generic"]>().returns.toEqualTypeOf<
      Effect.Effect<{ id: string }, DomainTag>
    >();
  });
});

describe("RepoFxDb", () => {
  it("drops the handle and requires Db", () => {
    expectTypeOf<FxDb["plain"]>().toEqualTypeOf<
      (id: string) => Effect.Effect<{ id: string } | null, DomainTag, Db>
    >();
    expectTypeOf<FxDb["optional"]>().toEqualTypeOf<
      (
        id: string,
        opts?: { limit?: number }
      ) => Effect.Effect<number, DomainTag, Db>
    >();
    expectTypeOf<FxDb["none"]>().toEqualTypeOf<
      () => Effect.Effect<void, DomainTag, Db>
    >();
  });
});

describe("jobsRepoFx", () => {
  it("carries the real repo's types through both views", () => {
    expectTypeOf<typeof jobsRepoFx.get>().toEqualTypeOf<
      (exec: DbExec, jobId: string) => Effect.Effect<JobRow | null, DomainTag>
    >();
    expectTypeOf<typeof jobsRepoFx.create>().toEqualTypeOf<
      (exec: DbExec, values: NewJob) => Effect.Effect<JobRow | null, DomainTag>
    >();
    expectTypeOf<typeof jobsRepoFxDb.get>().toEqualTypeOf<
      (jobId: string) => Effect.Effect<JobRow | null, DomainTag, Db>
    >();
  });
});
