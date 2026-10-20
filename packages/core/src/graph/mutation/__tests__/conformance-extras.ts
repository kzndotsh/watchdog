import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import { listAllActivity, listAllGraphHistory } from "@watchdog/test-db";
import { rendezvous, testId } from "@watchdog/test-kit";

import { transact } from "../../../infra/postgres-tx";
import { setHistoryContextEffect } from "../../graph-activity";
import { runGraphMutationInTx } from "../run-graph-mutation";
import {
  ACTOR,
  failureOf,
  MISSING_ID,
  type Harness,
  type Scope,
  type Spec,
} from "./conformance-support";

/**
 * The cases of a table with an Evidence linker or a transition (#420), run inside the table's
 * `describe` from `defineConformance`.
 */
export function defineLinkedConformance<
  Row extends { id: string; version: number },
  Rec,
  Ins,
  Pat,
  Ctx extends Scope,
>(
  spec: Spec<Row, Rec, Ins, Pat, Ctx>,
  { table, mutateOwn, totals }: Harness<Row, Rec, Ins, Pat, Ctx>
) {
  const { evidence, transition } = spec;
  if (evidence !== undefined) {
    describe("Evidence", () => {
      it("linking Evidence bumps the version, and the record is the row as it now stands", async () => {
        const ctx = await spec.seed();
        const [first] = await evidence.ids(ctx);
        if (first === undefined) throw new Error("no Evidence seeded");

        const bare = await runDomain(
          mutateOwn(ctx, "dossier", (w) =>
            w.insert(table, spec.values(ctx, "bare"), { evidence: [] })
          )
        );
        const cited = await runDomain(
          mutateOwn(ctx, "dossier", (w) =>
            w.insert(table, spec.values(ctx, "cited"), { evidence: [first] })
          )
        );

        const stored = await spec.rowOf(ctx, evidence.describe(cited).id);
        expect(evidence.describe(cited).version).toBe(stored.version);
        expect(stored.version).toBeGreaterThan(evidence.describe(bare).version);
        expect(await evidence.linked(stored.id)).toEqual([first]);
      });

      it("a joined mutation checks its evidenceIds once and still refuses any other id", async () => {
        const ctx = await spec.seed();
        const [first, second] = await evidence.ids(ctx);
        if (first === undefined || second === undefined) {
          throw new Error("no Evidence seeded");
        }
        const outside = testId(9998);
        const joined = (evidenceIds: string[], cites: string[]) =>
          transact((tx) =>
            Effect.gen(function* joinedGen() {
              yield* setHistoryContextEffect(tx, {
                ...ACTOR,
                channel: "agent_write",
              });
              return yield* runGraphMutationInTx(
                tx,
                { caseId: ctx.caseId, actor: ACTOR, evidenceIds },
                (w) =>
                  w.insert(table, spec.values(ctx, "inserted"), {
                    evidence: cites,
                  })
              );
            })
          );
        const before = await totals();
        const rows = await spec.countRows(ctx);

        // An id declared for the mutation that is not Evidence of the Case fails up front.
        expect(
          await runDomain(failureOf(joined([outside], [outside])))
        ).toMatchObject({ _tag: "InvalidError" });
        // A write that cites an id outside the declared set is checked on its own.
        expect(
          await runDomain(failureOf(joined([first], [first, outside])))
        ).toMatchObject({ _tag: "InvalidError" });
        expect(await totals()).toEqual(before);
        expect(await spec.countRows(ctx)).toBe(rows);

        // Declared ids and a valid undeclared one are all accepted.
        await runDomain(joined([first], [first, second]));
        expect(await spec.countRows(ctx)).toBe(rows + 1);
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
            mutateOwn(ctx, "dossier", (w) =>
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
          mutateOwn(ctx, "dossier", (w) =>
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
            mutateOwn(ctx, "dossier", (w) =>
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
          mutateOwn(ctx, "dossier", (w) => transition.run(w, row.id))
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
          mutateOwn(ctx, "dossier", (w) => transition.run(w, row.id))
        );
        const before = await totals();

        const error = await runDomain(
          failureOf(mutateOwn(ctx, "dossier", (w) => transition.run(w, row.id)))
        );

        expect(error).toMatchObject({ _tag: "ConflictError" });
        expect(await totals()).toEqual(before);
      });

      it("of two concurrent runs exactly one wins, the other is Conflict, and one entry is appended", async () => {
        const ctx = await spec.seed();
        const row = await spec.rowOf(ctx);
        const before = await totals();
        const bothReady = rendezvous(2);
        const writer = () =>
          runDomain(
            mutateOwn(ctx, "dossier", (w) =>
              Effect.promise(bothReady).pipe(
                Effect.andThen(transition.run(w, row.id))
              )
            )
          );

        const settled = await Promise.allSettled([writer(), writer()]);

        expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(
          settled.find((r) => r.status === "rejected")?.reason
        ).toMatchObject({ _tag: "ConflictError" });
        const after = await totals();
        expect(after.history).toBe(before.history + 1);
        expect(after.activity).toBe(before.activity + 1);
      });

      it("on a missing row is NotFound", async () => {
        const ctx = await spec.seed();
        const before = await totals();

        const error = await runDomain(
          failureOf(
            mutateOwn(ctx, "dossier", (w) => transition.run(w, MISSING_ID))
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
}
