import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  resolveQuestionFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useResolveQuestion } from "@/domains/dossier/hooks/use-resolve-question";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useResolveQuestion", () => {
  it("settles the Case the question was resolved in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useResolveQuestion({ onResolved: onDone }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        questionId: testId(30),
        resolvedNote: "Found in WHOIS",
      },
    });
  });
});
