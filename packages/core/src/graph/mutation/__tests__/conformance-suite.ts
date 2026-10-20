import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { InternalError, type DomainTag } from "@watchdog/core/errors";
import { runDomain, type Db } from "@watchdog/core/infra";
import type {
  CaseId,
  GraphHistoryChannel,
  GraphHistoryKind,
  OrganizationId,
} from "@watchdog/schemas/shared";
import { TEST_OTHER_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  listAllGraphHistory,
  resetTestDb,
} from "@watchdog/test-db";
import { rendezvous, TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import { transact } from "../../../infra/postgres-tx";
import { setHistoryContextEffect } from "../../graph-activity";
import { isRemovable, type GraphTable } from "../graph-table";
import {
  runGraphMutation,
  runGraphMutationInTx,
  type GraphWriter,
} from "../run-graph-mutation";

/**
 * The Graph mutation module's contract, run against every `GraphTable` (#419). A table
 * joins the module by adding a `defineConformance` call in `conformance.int.test.ts`; the suite then proves, on
 * a real database, that its writes roll back whole, leave exactly one history row and one
 * activity entry, check the version, tell a missing row from a stale one, and let exactly
 * one of two concurrent writers win. A table with an Evidence linker or a transition also
 * runs the Evidence and transition cases (#420).
 */

export type Scope = { caseId: CaseId; organizationId: OrganizationId };

type Spec<
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

const ACTOR = {
  actorId: TEST_ACTOR_ID,
  actorLabel: "api-key:conformance",
  actorKeyId: "key-conformance",
} as const;
/**
 * How a write enters the module: `own` opens the transaction (`runGraphMutation`); `joined`
 * is a step of the caller's, which set the history context first (`runGraphMutationInTx`,
 * the path of Triage Accept and the agent graph write).
 */
type Route = { channel: GraphHistoryChannel; entry: "own" | "joined" };
const ROUTES: readonly Route[] = [
  { channel: "dossier", entry: "own" },
  { channel: "triage_accept", entry: "own" },
  { channel: "triage_accept", entry: "joined" },
  { channel: "agent_write", entry: "joined" },
];
const MISSING_ID = testId(9999);

/** The effect's failure as a success; a mutation that succeeds dies, failing the test. */
function failureOf<A, E extends DomainTag, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<E, never, R> {
  return effect.pipe(
    Effect.flatMap(() =>
      Effect.die(new Error("the mutation succeeded; a failure was expected"))
    ),
    Effect.flip
  );
}

export function defineConformance<
  Row extends { id: string; version: number },
  Rec,
  Ins,
  Pat,
  Ctx extends Scope,
>(spec: Spec<Row, Rec, Ins, Pat, Ctx>) {
  const { table } = spec;
  const mutate = <A, E extends DomainTag>(
    ctx: Ctx,
    route: GraphHistoryChannel | Route,
    body: (w: GraphWriter) => Effect.Effect<A, E, Db>
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
  const removable = isRemovable(table) ? table : undefined;
  const labelOf = spec.label ?? ((name: string) => name);
  const boom = new InternalError({ reason: "conformance: forced failure" });
  const totals = async () => ({
    history: (await listAllGraphHistory()).length,
    activity: (await listAllActivity()).length,
  });

  describe(`Graph mutation conformance: ${spec.name}`, () => {
    beforeEach(async () => {
      await resetTestDb();
    });

    describe.each(ROUTES)("channel $channel, $entry", (route) => {
      const { channel } = route;
      it("a failing insert, update or remove leaves no row, history row or activity entry", async () => {
        const ctx = await spec.seed();
        const row = await spec.rowOf(ctx);
        const before = { ...(await totals()), rows: await spec.countRows(ctx) };

        await runDomain(
          failureOf(
            mutate(ctx, route, (w) =>
              w
                .insert(table, spec.values(ctx, "rolled back"))
                .pipe(Effect.andThen(Effect.fail(boom)))
            )
          )
        );
        await runDomain(
          failureOf(
            mutate(ctx, route, (w) =>
              w
                .update(table, row.id, spec.patch(row, "rolled back"), {
                  expectedVersion: row.version,
                })
                .pipe(Effect.andThen(Effect.fail(boom)))
            )
          )
        );
        if (removable !== undefined) {
          await runDomain(
            failureOf(
              mutate(ctx, route, (w) =>
                w
                  .remove(removable, row.id)
                  .pipe(Effect.andThen(Effect.fail(boom)))
              )
            )
          );
        }

        expect({
          ...(await totals()),
          rows: await spec.countRows(ctx),
        }).toEqual(before);
        expect(await spec.rowOf(ctx)).toEqual(row);
      });

      it("a successful write leaves exactly one history row and one activity entry, with the verb, channel and actor", async () => {
        const ctx = await spec.seed();
        const row = await spec.rowOf(ctx);
        const rowsBefore = await spec.countRows(ctx);

        const expectWrite = async (
          run: () => Promise<unknown>,
          expected: { op: string; action: string; label: string },
          rowId: string | undefined
        ) => {
          const before = await totals();
          await run();
          const history = (await listAllGraphHistory()).slice(before.history);
          const activity = (await listAllActivity()).slice(before.activity);
          expect(history).toHaveLength(1);
          expect(activity).toHaveLength(1);
          expect(history[0]).toMatchObject({
            caseId: ctx.caseId,
            kind: spec.historyKind,
            op: expected.op,
            channel,
            actorId: ACTOR.actorId,
            actorLabel: ACTOR.actorLabel,
            actorKeyId: ACTOR.actorKeyId,
          });
          expect(activity[0]).toMatchObject({
            caseId: ctx.caseId,
            kind: table.kind,
            action: expected.action,
            subjectId: history[0]?.rowId,
            label: expected.label,
            actorId: ACTOR.actorId,
            actorKeyId: ACTOR.actorKeyId,
          });
          if (rowId !== undefined) expect(history[0]?.rowId).toBe(rowId);
        };

        await expectWrite(
          () =>
            runDomain(
              mutate(ctx, route, (w) =>
                w.insert(table, spec.values(ctx, "inserted"))
              )
            ),
          { op: "create", action: "created", label: labelOf("inserted") },
          undefined
        );
        expect(await spec.countRows(ctx)).toBe(rowsBefore + 1);

        await expectWrite(
          () =>
            runDomain(
              mutate(ctx, route, (w) =>
                w.update(table, row.id, spec.patch(row, "updated"), {
                  expectedVersion: row.version,
                })
              )
            ),
          { op: "update", action: "updated", label: labelOf("updated") },
          row.id
        );
        expect((await spec.rowOf(ctx)).version).toBe(row.version + 1);

        if (removable !== undefined) {
          await expectWrite(
            () =>
              runDomain(mutate(ctx, route, (w) => w.remove(removable, row.id))),
            { op: "delete", action: "deleted", label: labelOf("updated") },
            row.id
          );
          expect(await spec.countRows(ctx)).toBe(rowsBefore);
        }
      });
    });

    it("a stale version is StaleVersion with the current version, and writes nothing", async () => {
      const ctx = await spec.seed();
      const row = await spec.rowOf(ctx);
      await runDomain(
        mutate(ctx, "dossier", (w) =>
          w.update(table, row.id, spec.patch(row, "first"), {
            expectedVersion: row.version,
          })
        )
      );
      const before = await totals();

      const error = await runDomain(
        failureOf(
          mutate(ctx, "dossier", (w) =>
            w.update(table, row.id, spec.patch(row, "second"), {
              expectedVersion: row.version,
            })
          )
        )
      );

      expect(error).toMatchObject({
        _tag: "StaleVersionError",
        entity: table.entity,
        id: row.id,
        currentVersion: row.version + 1,
      });
      expect(await totals()).toEqual(before);
    });

    it("a missing row is NotFound, not StaleVersion, for get, update and remove", async () => {
      const ctx = await spec.seed();
      const row = await spec.rowOf(ctx);
      const before = await totals();
      const missing = { _tag: "NotFoundError", entity: table.entity };

      expect(
        await runDomain(
          failureOf(mutate(ctx, "dossier", (w) => w.get(table, MISSING_ID)))
        )
      ).toMatchObject(missing);
      expect(
        await runDomain(
          failureOf(
            mutate(ctx, "dossier", (w) =>
              w.update(table, MISSING_ID, spec.patch(row, "x"), {
                expectedVersion: 1,
              })
            )
          )
        )
      ).toMatchObject(missing);
      if (removable !== undefined) {
        expect(
          await runDomain(
            failureOf(
              mutate(ctx, "dossier", (w) => w.remove(removable, MISSING_ID))
            )
          )
        ).toMatchObject(missing);
      }
      expect(
        await runDomain(
          failureOf(mutate(ctx, "dossier", (w) => w.get(table, "not-an-id")))
        )
      ).toMatchObject(missing);
      expect(await totals()).toEqual(before);
    });

    it("a Case of another organization is NotFound and nothing is written", async () => {
      const ctx = await spec.seed();
      const row = await spec.rowOf(ctx);
      const before = await totals();

      const error = await runDomain(
        failureOf(
          runGraphMutation(
            {
              caseId: ctx.caseId,
              organizationId: TEST_OTHER_ORGANIZATION_ID,
              actor: ACTOR,
              channel: "dossier",
            },
            (w) => w.get(table, row.id)
          )
        )
      );

      expect(error).toMatchObject({ _tag: "NotFoundError", entity: "Case" });
      expect(await totals()).toEqual(before);
      expect(await spec.rowOf(ctx)).toEqual(row);
    });

    const { evidence, transition, uniqueIndex } = spec;
    if (uniqueIndex !== undefined) {
      describe("unique index", () => {
        const conflict = (ctx: Ctx) => {
          const reason = table.uniqueIndex?.conflictReason;
          return {
            _tag: "ConflictError",
            reason:
              typeof reason === "function"
                ? reason(uniqueIndex.values(ctx))
                : reason,
          };
        };
        const seedKey = async () => {
          const ctx = await spec.seed();
          const row = await spec.rowOf(ctx);
          await runDomain(
            mutate(ctx, "dossier", (w) =>
              w.insert(table, uniqueIndex.values(ctx))
            )
          );
          const rows = await spec.countRows(ctx);
          return { ctx, row, rows, before: await totals() };
        };

        it("a duplicate insert is Conflict with the declared reason, and writes nothing", async () => {
          const { ctx, rows, before } = await seedKey();

          const error = await runDomain(
            failureOf(
              mutate(ctx, "dossier", (w) =>
                w.insert(table, uniqueIndex.values(ctx))
              )
            )
          );

          expect(error).toMatchObject(conflict(ctx));
          expect(await totals()).toEqual(before);
          expect(await spec.countRows(ctx)).toBe(rows);
        });

        it("an edit into another row's key is Conflict with the declared reason, and writes nothing", async () => {
          const { ctx, row, before } = await seedKey();

          const error = await runDomain(
            failureOf(
              mutate(ctx, "dossier", (w) =>
                w.update(table, row.id, uniqueIndex.collide(row), {
                  expectedVersion: row.version,
                })
              )
            )
          );

          expect(error).toMatchObject(conflict(ctx));
          expect(await totals()).toEqual(before);
          expect(await spec.rowOf(ctx)).toEqual(row);
        });
      });
    }

    if (evidence !== undefined) {
      describe("Evidence", () => {
        it("linking Evidence bumps the version, and the record is the row as it now stands", async () => {
          const ctx = await spec.seed();
          const [first] = await evidence.ids(ctx);
          if (first === undefined) throw new Error("no Evidence seeded");

          const bare = await runDomain(
            mutate(ctx, "dossier", (w) =>
              w.insert(table, spec.values(ctx, "bare"), { evidence: [] })
            )
          );
          const cited = await runDomain(
            mutate(ctx, "dossier", (w) =>
              w.insert(table, spec.values(ctx, "cited"), { evidence: [first] })
            )
          );

          const stored = await spec.rowOf(ctx, evidence.describe(cited).id);
          expect(evidence.describe(cited).version).toBe(stored.version);
          expect(stored.version).toBeGreaterThan(
            evidence.describe(bare).version
          );
          expect(await evidence.linked(stored.id)).toEqual([first]);
        });

        it("an edit that replaces the Evidence links the new set and returns the settled version", async () => {
          const ctx = await spec.seed();
          const row = await spec.rowOf(ctx);
          const [first, second] = await evidence.ids(ctx);
          if (first === undefined || second === undefined) {
            throw new Error("no Evidence seeded");
          }
          const edit = (ids: string[], version: number) =>
            runDomain(
              mutate(ctx, "dossier", (w) =>
                w.update(table, row.id, spec.patch(row, "cited"), {
                  expectedVersion: version,
                  evidence: ids,
                })
              )
            );

          const one = await edit([first], row.version);
          expect(await evidence.linked(row.id)).toEqual([first]);
          expect(evidence.describe(one).version).toBe(
            (await spec.rowOf(ctx)).version
          );
          const two = await edit([second], evidence.describe(one).version);
          expect(await evidence.linked(row.id)).toEqual([second]);
          expect(evidence.describe(two).version).toBeGreaterThan(
            evidence.describe(one).version
          );
        });

        it("a stale update with Evidence is StaleVersion and leaves the links as they were", async () => {
          const ctx = await spec.seed();
          const row = await spec.rowOf(ctx);
          const [first, second] = await evidence.ids(ctx);
          if (first === undefined || second === undefined) {
            throw new Error("no Evidence seeded");
          }
          await runDomain(
            mutate(ctx, "dossier", (w) =>
              w.update(table, row.id, spec.patch(row, "first"), {
                expectedVersion: row.version,
                evidence: [first],
              })
            )
          );
          const moved = await spec.rowOf(ctx);
          const before = await totals();

          const error = await runDomain(
            failureOf(
              mutate(ctx, "dossier", (w) =>
                w.update(table, row.id, spec.patch(row, "second"), {
                  expectedVersion: row.version,
                  evidence: [second],
                })
              )
            )
          );

          expect(error).toMatchObject({
            _tag: "StaleVersionError",
            id: row.id,
            currentVersion: moved.version,
          });
          expect(await evidence.linked(row.id)).toEqual([first]);
          expect(await spec.rowOf(ctx)).toEqual(moved);
          expect(await totals()).toEqual(before);
        });
      });
    }

    if (transition !== undefined) {
      describe("transition", () => {
        it("appends its verb once, with the value", async () => {
          const ctx = await spec.seed();
          const row = await spec.rowOf(ctx);
          const before = await totals();

          await runDomain(
            mutate(ctx, "dossier", (w) => transition.run(w, row.id))
          );

          const history = (await listAllGraphHistory()).slice(before.history);
          const activity = (await listAllActivity()).slice(before.activity);
          expect(history).toHaveLength(1);
          expect(activity).toHaveLength(1);
          expect(activity[0]).toMatchObject({
            kind: table.kind,
            action: transition.action,
            subjectId: row.id,
            toValue: transition.toValue,
            ...(transition.fromValue === undefined
              ? {}
              : { fromValue: transition.fromValue }),
            actorId: ACTOR.actorId,
          });
        });

        it("a second run is Conflict and writes nothing", async () => {
          const ctx = await spec.seed();
          const row = await spec.rowOf(ctx);
          await runDomain(
            mutate(ctx, "dossier", (w) => transition.run(w, row.id))
          );
          const before = await totals();

          const error = await runDomain(
            failureOf(mutate(ctx, "dossier", (w) => transition.run(w, row.id)))
          );

          expect(error).toMatchObject({ _tag: "ConflictError" });
          expect(await totals()).toEqual(before);
        });

        it("on a missing row is NotFound", async () => {
          const ctx = await spec.seed();
          const before = await totals();

          const error = await runDomain(
            failureOf(
              mutate(ctx, "dossier", (w) => transition.run(w, MISSING_ID))
            )
          );

          expect(error).toMatchObject({
            _tag: "NotFoundError",
            entity: table.entity,
          });
          expect(await totals()).toEqual(before);
        });
      });
    }

    it("of two writers at the same version exactly one wins", async () => {
      const ctx = await spec.seed();
      const row = await spec.rowOf(ctx);
      const before = await totals();
      const bothReady = rendezvous(2);
      const writer = (label: string) =>
        runDomain(
          mutate(ctx, "dossier", (w) =>
            Effect.promise(bothReady).pipe(
              Effect.andThen(
                w.update(table, row.id, spec.patch(row, label), {
                  expectedVersion: row.version,
                })
              )
            )
          )
        );

      const settled = await Promise.allSettled([writer("a"), writer("b")]);

      expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = settled.find((r) => r.status === "rejected");
      expect(lost?.reason).toMatchObject({
        _tag: "StaleVersionError",
        currentVersion: row.version + 1,
      });
      const after = await totals();
      expect(after.history).toBe(before.history + 1);
      expect(after.activity).toBe(before.activity + 1);
      expect((await spec.rowOf(ctx)).version).toBe(row.version + 1);
    });
  });
}
