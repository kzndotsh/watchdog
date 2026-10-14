import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  createQuestionFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useCreateQuestion } from "@/domains/dossier/hooks/use-create-question";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useCreateQuestion", () => {
  it("settles the Case the question was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useCreateQuestion({ onCreated: onDone }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        text: "Who owns the domain?",
      },
    });
  });
});
