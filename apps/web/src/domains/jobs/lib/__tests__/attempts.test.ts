import { describe, expect, it } from "vitest";

import { buildJobListRecord } from "@/testing/records";
import { testId } from "@watchdog/test-kit";

import { attemptChain } from "../attempts";

const attempt = (n: number, retryOfJobId: string | null = null) =>
  buildJobListRecord({
    id: testId(n),
    retryOfJobId,
    createdAt: `2026-01-01T00:0${n}:00.000Z`,
  });

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe("attemptChain", () => {
  it("is the Job alone when nothing retries it and it retries nothing", () => {
    const jobs = [attempt(1), attempt(2)];

    expect(ids(attemptChain(jobs, testId(1)))).toEqual([testId(1)]);
  });

  it("lists earlier and later attempts, oldest first, from any attempt", () => {
    const first = attempt(1);
    const second = attempt(2, first.id);
    const third = attempt(3, second.id);
    const unrelated = attempt(4);
    // The list is newest first, as the queue returns it.
    const jobs = [unrelated, third, second, first];

    for (const from of [first, second, third]) {
      expect(ids(attemptChain(jobs, from.id))).toEqual([
        first.id,
        second.id,
        third.id,
      ]);
    }
  });

  it("includes every retry of a Job that was retried more than once", () => {
    const first = attempt(1);
    const jobs = [attempt(3, first.id), attempt(2, first.id), first];

    expect(ids(attemptChain(jobs, testId(3)))).toEqual([
      testId(1),
      testId(2),
      testId(3),
    ]);
  });

  it("starts at the oldest attempt present when an earlier one is gone", () => {
    const second = attempt(2, testId(9));
    const third = attempt(3, second.id);

    expect(ids(attemptChain([third, second], third.id))).toEqual([
      second.id,
      third.id,
    ]);
  });

  it("returns nothing for an id that is not in the list", () => {
    expect(attemptChain([attempt(1)], testId(7))).toEqual([]);
  });

  it("terminates on a cycle", () => {
    const a = attempt(1, testId(2));
    const b = attempt(2, testId(1));

    expect(ids(attemptChain([a, b], a.id))).toEqual([a.id, b.id]);
  });
});
