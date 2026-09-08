import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  listQuestionsFn: vi.fn(),
}));

import {
  questionsKeys,
  questionsListQuery,
} from "@/domains/entities/questions/queries";

describe("questions queries", () => {
  it("builds case- and entity-scoped keys", () => {
    expect(questionsKeys.prefix("case-1")).toEqual(["questions", "case-1"]);
    expect(questionsKeys.all("case-1", "ent-1")).toEqual([
      "questions",
      "case-1",
      "ent-1",
    ]);
  });

  it("uses default stale and gc tiers for entity questions", () => {
    expect(questionsListQuery("case-1", "ent-1")).toMatchObject({
      queryKey: questionsKeys.all("case-1", "ent-1"),
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
  });

  it("keeps placeholder data only for the same entity list key", () => {
    const entityOne = questionsListQuery("case-1", "ent-1");
    const entityTwo = questionsListQuery("case-1", "ent-2");
    const placeholderOne = entityOne.placeholderData;
    const placeholderTwo = entityTwo.placeholderData;
    expect(typeof placeholderOne).toBe("function");
    expect(typeof placeholderTwo).toBe("function");
    if (
      typeof placeholderOne !== "function" ||
      typeof placeholderTwo !== "function"
    ) {
      return;
    }

    const previousData = [{ id: "question-1" }] as never;
    const entityOneQuery = { queryKey: questionsKeys.all("case-1", "ent-1") };
    const entityTwoQuery = { queryKey: questionsKeys.all("case-1", "ent-2") };

    expect(placeholderOne(previousData, entityOneQuery as never)).toEqual(
      previousData
    );
    expect(
      placeholderOne(previousData, entityTwoQuery as never)
    ).toBeUndefined();
    expect(placeholderTwo(previousData, entityTwoQuery as never)).toEqual(
      previousData
    );
    expect(
      placeholderTwo(previousData, entityOneQuery as never)
    ).toBeUndefined();
  });
});
