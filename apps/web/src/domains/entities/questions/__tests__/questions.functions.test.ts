import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}));

const questionsApi = {
  list: vi.fn(),
  create: vi.fn(),
  resolve: vi.fn(),
  update: vi.fn(),
  reopen: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({ questions: questionsApi }),
}));

import {
  createQuestionFn,
  deleteQuestionFn,
  listQuestionsFn,
  reopenQuestionFn,
  resolveQuestionFn,
  updateQuestionFn,
} from "@/domains/entities/questions/questions.functions";

interface ServerDataContext<T> {
  data: T;
  context: Record<string, never>;
}

describe("questions.functions", () => {
  it("routes question list and lifecycle ServerFns through oRPC", async () => {
    const question = {
      id: testId(1),
      entityId: testId(20),
      text: "Who owns the domain?",
      status: "open" as const,
      resolvedNote: null,
    };
    questionsApi.list.mockResolvedValue([question]);
    questionsApi.create.mockResolvedValue(question);
    questionsApi.resolve.mockResolvedValue({
      ...question,
      status: "resolved" as const,
    });
    questionsApi.update.mockResolvedValue(question);
    questionsApi.reopen.mockResolvedValue(question);
    questionsApi.delete.mockResolvedValue({ ok: true });

    await (
      listQuestionsFn as unknown as (
        input: ServerDataContext<{ caseId: string; entityId: string }>
      ) => Promise<unknown[]>
    )({
      data: { caseId: testId(10), entityId: testId(20) },
      context: {},
    });
    await (
      createQuestionFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: {
        caseId: testId(10),
        entityId: testId(20),
        text: "Who owns the domain?",
      },
      context: {},
    });
    await (
      resolveQuestionFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: {
        caseId: testId(10),
        questionId: testId(1),
        resolvedNote: "Found in WHOIS",
      },
      context: {},
    });
    await (
      updateQuestionFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: {
        caseId: testId(10),
        questionId: testId(1),
        text: "Updated question",
      },
      context: {},
    });
    await (
      reopenQuestionFn as unknown as (
        input: ServerDataContext<{ caseId: string; questionId: string }>
      ) => Promise<unknown>
    )({
      data: { caseId: testId(10), questionId: testId(1) },
      context: {},
    });
    await (
      deleteQuestionFn as unknown as (
        input: ServerDataContext<{ caseId: string; questionId: string }>
      ) => Promise<void>
    )({
      data: { caseId: testId(10), questionId: testId(1) },
      context: {},
    });

    expect(questionsApi.list).toHaveBeenCalled();
    expect(questionsApi.create).toHaveBeenCalled();
    expect(questionsApi.resolve).toHaveBeenCalled();
    expect(questionsApi.update).toHaveBeenCalled();
    expect(questionsApi.reopen).toHaveBeenCalled();
    expect(questionsApi.delete).toHaveBeenCalled();
  });
});
