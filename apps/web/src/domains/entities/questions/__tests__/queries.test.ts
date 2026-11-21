import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import {
  questionListView,
  questionsKeys,
} from "@/domains/entities/questions/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { questionList } from "@watchdog/domain/schemas/graph";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

const listQuestions = procedureDouble("questions.list");

describe("questions queries", () => {
  it("sends one page of the view with its fixed Entity and the Case to questions.list", async () => {
    const caseId = testCaseId(1);
    listQuestions.mockResolvedValue({
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
    expect(listQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "signs",
        sort: "created.desc",
      })
    );
    expect(listQuestions.mock.lastCall?.[0]).not.toHaveProperty("cursor");
  });

  it("keys a view under the Case's questions key, not another Case's", () => {
    const view = (caseId: string) =>
      questionListView.key({ caseId }, questionList.queryOf({}, {}));
    const client = new QueryClient();
    client.setQueryData(view(testCaseId(1)), { pages: [], pageParams: [] });
    client.setQueryData(view(testCaseId(2)), { pages: [], pageParams: [] });
    const matched = client
      .getQueryCache()
      .findAll({ queryKey: questionsKeys.all(testCaseId(1)) })
      .map((query) => query.queryKey);
    expect(matched).toEqual([view(testCaseId(1))]);
  });
});
