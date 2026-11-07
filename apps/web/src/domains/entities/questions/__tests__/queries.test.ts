import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const listQuestionsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  listQuestionsPageFn,
}));

import { questionListView } from "@/domains/entities/questions/queries";
import { questionList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("questions queries", () => {
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
        { q: "signs", sort: "created.desc" },
        { entityId: testId(2) }
      )
    );
    await new QueryClient().infiniteQuery(options);
    expect(listQuestionsPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "signs",
        sort: "created.desc",
      }),
    });
    expect(listQuestionsPageFn.mock.lastCall?.[0]).not.toHaveProperty(
      "data.cursor"
    );
  });
});
