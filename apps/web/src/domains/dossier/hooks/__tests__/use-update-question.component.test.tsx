import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  updateQuestionFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useUpdateQuestion } from "@/domains/dossier/hooks/use-update-question";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useUpdateQuestion", () => {
  it("settles the Case the question was edited in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useUpdateQuestion({ onUpdated: onDone }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        questionId: testId(30),
        text: "Who owns it?",
      },
    });
  });
});
