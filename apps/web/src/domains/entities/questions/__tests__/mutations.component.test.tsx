import { describe, it, vi } from "vitest";

const onError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "@/domains/entities/hooks/__tests__/helpers/entity-write-harness";
import {
  useCreateQuestion,
  useDeleteQuestion,
  useReopenQuestion,
  useResolveQuestion,
  useUpdateQuestion,
} from "@/domains/entities/questions/mutations";
import { procedureDouble } from "@/testing/orpc-client";
import { testId } from "@watchdog/test-kit";

const procedures = {
  createQuestionFn: procedureDouble("questions.create"),
  deleteQuestionFn: procedureDouble("questions.delete"),
  reopenQuestionFn: procedureDouble("questions.reopen"),
  resolveQuestionFn: procedureDouble("questions.resolve"),
  updateQuestionFn: procedureDouble("questions.update"),
};

describe("questions Graph child mutations", () => {
  it("settles the Case the question was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useCreateQuestion({ onSuccess: onDone }),
      procedure: procedures.createQuestionFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        text: "Who owns the domain?",
      },
    });
  });

  it("settles the Case the question was deleted in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useDeleteQuestion({ onSuccess: onDone, onError }),
      procedure: procedures.deleteQuestionFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        questionId: testId(30),
      },
    });
  });

  it("settles the Case the question was reopened in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useReopenQuestion({ onSuccess: onDone, onError }),
      procedure: procedures.reopenQuestionFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        questionId: testId(30),
      },
    });
  });

  it("settles the Case the question was resolved in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useResolveQuestion({ onSuccess: onDone }),
      procedure: procedures.resolveQuestionFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        questionId: testId(30),
        resolvedNote: "Found in WHOIS",
      },
    });
  });

  it("settles the Case the question was edited in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useUpdateQuestion({ onSuccess: onDone }),
      procedure: procedures.updateQuestionFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        expectedVersion: 1,
        questionId: testId(30),
        text: "Who owns it?",
      },
    });
  });
});
