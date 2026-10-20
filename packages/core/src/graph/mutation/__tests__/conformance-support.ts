import { Effect } from "effect";

import type { DomainTag } from "@watchdog/core/errors";
import type { Db } from "@watchdog/core/infra";
import type {
  CaseId,
  GraphHistoryChannel,
  GraphHistoryKind,
  OrganizationId,
} from "@watchdog/schemas/shared";
import { listAllActivity, listAllGraphHistory } from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import { transact } from "../../../infra/postgres-tx";
import { setHistoryContextEffect } from "../../graph-activity";
import { isRemovable, type GraphTable } from "../graph-table";
import {
  runGraphMutation,
  runGraphMutationInTx,
  type GraphWriter,
  type JoinedGraphWriter,
} from "../run-graph-mutation";

/** What the conformance suite needs to know about one table; see `defineConformance`. */
export type Scope = { caseId: CaseId; organizationId: OrganizationId };

export type Spec<
  Row extends { id: string; version: number },
  Rec,
  Ins,
  Pat,
  Ctx extends Scope,
> = {
  name: string;
  table: GraphTable<Row, Rec, Ins, Pat>;
  historyKind: GraphHistoryKind;
  /** A Case holding one row of the table. */
  seed: () => Promise<Ctx>;
  /** The seeded row (or the row `id`), read now. */
  rowOf: (ctx: Ctx, id?: string) => Promise<Row>;
  /** How many rows of the table the Case has. */
  countRows: (ctx: Ctx) => Promise<number>;
  /** Values of a new row whose activity label is `label`. */
  values: (ctx: Ctx, label: string) => Ins;
  /** An edit of an existing row whose activity label becomes `label`. */
  patch: (row: Row, label: string) => Pat;
  /**
   * The activity label a row gets when `values` or `patch` is given `name`. Defaults to
   * `name`; a table whose label is a column with a vocabulary (an Edge's predicate) maps it.
   */
  label?: (name: string) => string;
  /** For a table with a unique index (it declares `uniqueIndex`). */
  uniqueIndex?: {
    /** Values of a new row with a fixed natural key, none of the seeded row's. */
    values: (ctx: Ctx) => Ins;
    /** An edit that gives `row` the key `values` has. */
    collide: (row: Row) => Pat;
  };
  /** For a table with an Evidence linker. */
  evidence?: {
    /** At least two ids of Evidence in the Case. */
    ids: (ctx: Ctx) => Promise<string[]>;
    /** The Evidence ids linked to row `id` now, sorted. */
    linked: (id: string) => Promise<string[]>;
    /** The id and version a record carries. */
    describe: (rec: Rec) => { id: string; version: number };
  };
  /** For a table with a state-guarded transition. */
  transition?: {
    /** Runs the transition on row `id`. It only succeeds on the first run. */
    run: (w: GraphWriter, id: string) => Effect.Effect<Rec, DomainTag, Db>;
    /** The activity verb, `fromValue` (when it records one) and `toValue` it appends. */
    action: string;
    fromValue?: string;
    toValue: string;
  };
};

export const ACTOR = {
  actorId: TEST_ACTOR_ID,
  actorLabel: "api-key:conformance",
  actorKeyId: "key-conformance",
} as const;
/**
 * How a write enters the module: `own` opens the transaction (`runGraphMutation`); `joined`
 * is a step of the caller's, which set the history context first (`runGraphMutationInTx`,
 * the path of Triage Accept and the agent graph write).
 */
export type Route = { channel: GraphHistoryChannel; entry: "own" | "joined" };
export const ROUTES: readonly Route[] = [
  { channel: "dossier", entry: "own" },
  { channel: "triage_accept", entry: "own" },
  { channel: "triage_accept", entry: "joined" },
  { channel: "agent_write", entry: "joined" },
];
export const MISSING_ID = testId(9999);

/** The effect's failure as a success; a mutation that succeeds dies, failing the test. */
export function failureOf<A, E extends DomainTag, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<E, never, R> {
  return effect.pipe(
    Effect.flatMap(() =>
      Effect.die(new Error("the mutation succeeded; a failure was expected"))
    ),
    Effect.flip
  );
}

/** The pieces every conformance case shares, built once per table. */
export function makeHarness<
  Row extends { id: string; version: number },
  Rec,
  Ins,
  Pat,
  Ctx extends Scope,
>(spec: Spec<Row, Rec, Ins, Pat, Ctx>) {
  const { table } = spec;
  /**
   * Run `body` through the module the way `route` enters it. Its writer is the joined one
   * (what both entries support), so a write's record has no `version`; a case that reads the
   * version off a record uses `mutateOwn`.
   */
  const mutate = <A, E extends DomainTag>(
    ctx: Ctx,
    route: GraphHistoryChannel | Route,
    body: (w: JoinedGraphWriter) => Effect.Effect<A, E, Db>
  ) => {
    const { channel, entry } =
      typeof route === "string" ? { channel: route, entry: "own" } : route;
    if (entry === "own") {
      return runGraphMutation({ ...ctx, actor: ACTOR, channel }, body);
    }
    return transact((tx) =>
      Effect.gen(function* joinedGen() {
        yield* setHistoryContextEffect(tx, { ...ACTOR, channel });
        return yield* runGraphMutationInTx(
          tx,
          { caseId: ctx.caseId, actor: ACTOR },
          body
        );
      })
    );
  };
  /** The module's own entry, whose writer returns settled records. */
  const mutateOwn = <A, E extends DomainTag>(
    ctx: Ctx,
    channel: GraphHistoryChannel,
    body: (w: GraphWriter) => Effect.Effect<A, E, Db>
  ) => runGraphMutation({ ...ctx, actor: ACTOR, channel }, body);
  const totals = async () => ({
    history: (await listAllGraphHistory()).length,
    activity: (await listAllActivity()).length,
  });
  return {
    table,
    mutate,
    mutateOwn,
    totals,
    removable: isRemovable(table) ? table : undefined,
    labelOf: spec.label ?? ((name: string) => name),
  };
}

export type Harness<
  Row extends { id: string; version: number },
  Rec,
  Ins,
  Pat,
  Ctx extends Scope,
> = ReturnType<typeof makeHarness<Row, Rec, Ins, Pat, Ctx>>;
