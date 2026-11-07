import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  createQuestionFn,
  deleteQuestionFn,
  listQuestionsPageFn,
  reopenQuestionFn,
  resolveQuestionFn,
  updateQuestionFn,
} from "@/domains/entities/questions/questions.functions";
import { callServerFn, orpc } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(10);

beforeEach(() => orpc.reset());

describe("deleteQuestionFn", () => {
  it("sends only the Case and Question ids and answers nothing", async () => {
    orpc.reply("questions.delete", { ok: true });

    await expect(
      callServerFn(deleteQuestionFn, { caseId: CASE_ID, questionId: testId(1) })
    ).resolves.toBeUndefined();

    expect(orpc.calls("questions.delete")).toEqual([
      { caseId: CASE_ID, questionId: testId(1) },
    ]);
  });
});

describe("input validation", () => {
  it.each([
    ["listQuestionsPageFn", listQuestionsPageFn, { caseId: "not-a-uuid" }],
    [
      "createQuestionFn",
      createQuestionFn,
      { caseId: CASE_ID, entityId: testId(20), text: "" },
    ],
    [
      "resolveQuestionFn",
      resolveQuestionFn,
      { caseId: CASE_ID, questionId: "x" },
    ],
    [
      "updateQuestionFn",
      updateQuestionFn,
      { caseId: CASE_ID, questionId: "x" },
    ],
    [
      "reopenQuestionFn",
      reopenQuestionFn,
      { caseId: CASE_ID, questionId: "x" },
    ],
    [
      "deleteQuestionFn",
      deleteQuestionFn,
      { caseId: CASE_ID, questionId: "x" },
    ],
  ] as const)(
    "%s refuses a malformed input before the API is called",
    async (_name, fn, input) => {
      await expect(callServerFn(fn, input)).rejects.toThrow();

      for (const path of [
        "questions.list",
        "questions.create",
        "questions.resolve",
        "questions.update",
        "questions.reopen",
        "questions.delete",
      ] as const) {
        expect(orpc.calls(path)).toEqual([]);
      }
    }
  );

  it("trims padded ids on the list read", async () => {
    orpc.reply("questions.list", { items: [], nextCursor: null, total: null });

    await callServerFn(listQuestionsPageFn, {
      caseId: `  ${CASE_ID}  `,
      entityId: testId(20),
    });

    expect(orpc.calls("questions.list")).toMatchObject([
      { caseId: CASE_ID, entityId: testId(20) },
    ]);
  });
});
