import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

const listQuestionsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  listQuestionsPageFn,
}));

import {
  questionsKeys,
  questionListView,
} from "@/domains/entities/questions/queries";
import { questionList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("questions queries", () => {
  it("keys every list view under the Case prefix that invalidation names", () => {
    const caseId = testCaseId(1);
    expect(questionsKeys.prefix(caseId)).toEqual(["questions", caseId]);
    const key = questionListView.key(
      { caseId },
      questionList.queryOf({}, { entityId: testId(2) })
    );
    expect(key.slice(0, 2)).toEqual(questionsKeys.prefix(caseId));
    expect(key[2]).toBe("list");
  });

  it("sends one page of the view with its fixed Entity and the Case", async () => {
    const caseId = testCaseId(1);
    listQuestionsPageFn.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
    const options = questionListView.infinite(
      { caseId },
      questionList.queryOf(
        { q: "signs", sort: "added.desc" },
        { entityId: testId(2) }
      )
    );
    expect(options).toMatchObject({
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    await new QueryClient().infiniteQuery(options);
    expect(listQuestionsPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "signs",
        sort: "added.desc",
      }),
    });
    expect(listQuestionsPageFn.mock.lastCall?.[0]).not.toHaveProperty(
      "data.cursor"
    );
  });
});
