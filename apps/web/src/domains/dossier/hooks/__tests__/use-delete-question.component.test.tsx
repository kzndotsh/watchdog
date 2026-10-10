import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  deleteQuestionFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useDeleteQuestion } from "@/domains/dossier/hooks/use-delete-question";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectReportsFailure,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useDeleteQuestion", () => {
  it("settles the Case the question was deleted in after the screen moves to another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useDeleteQuestion({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        questionId: testId(30),
      },
    });
  });

  it("reports a rejected write and settles nothing", async () => {
    await expectReportsFailure({
      useVerb: () => useDeleteQuestion({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        questionId: testId(30),
      },
      onError,
    });
  });
});
