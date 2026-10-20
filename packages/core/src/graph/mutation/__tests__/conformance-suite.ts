import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { InternalError } from "@watchdog/core/errors";
import { runDomain } from "@watchdog/core/infra";
import { TEST_OTHER_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  listAllGraphHistory,
  resetTestDb,
} from "@watchdog/test-db";
import { rendezvous } from "@watchdog/test-kit";

import { runGraphMutation } from "../run-graph-mutation";
import { defineLinkedConformance } from "./conformance-extras";
import {
  ACTOR,
  failureOf,
  makeHarness,
  MISSING_ID,
  ROUTES,
  type Scope,
  type Spec,
} from "./conformance-support";

export type { Scope };

/**
 * The Graph mutation module's contract, run against every `GraphTable` (#419). A table
 * joins the module by adding a `defineConformance` call in `conformance.int.test.ts`; the suite then proves, on
 * a real database, that its writes roll back whole, leave exactly one history row and one
 * activity entry, check the version, tell a missing row from a stale one, and let exactly
 * one of two concurrent writers win. A table with an Evidence linker or a transition also
 * runs the Evidence and transition cases (#420).
 */
export function defineConformance<
  Row extends { id: string; version: number },
  Rec,
  Ins,
  Pat,
  Ctx extends Scope,
>(spec: Spec<Row, Rec, Ins, Pat, Ctx>) {
  const harness = makeHarness(spec);
  const { table, mutate, removable, labelOf, totals } = harness;
  const boom = new InternalError({ reason: "conformance: forced failure" });

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

    const { uniqueIndex } = spec;
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

    defineLinkedConformance(spec, harness);

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
