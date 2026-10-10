import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  updateQuestionFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useUpdateQuestion } from "@/domains/dossier/hooks/use-update-question";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useUpdateQuestion", () => {
  it("settles the Case the question was edited in after the screen moves to another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useUpdateQuestion(),
      serverFn,
      variables: {
        ...SCOPE_A,
        questionId: testId(30),
        text: "Who owns it?",
      },
    });
  });
});
