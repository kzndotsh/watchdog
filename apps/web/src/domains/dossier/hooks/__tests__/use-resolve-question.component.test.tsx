import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  resolveQuestionFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useResolveQuestion } from "@/domains/dossier/hooks/use-resolve-question";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useResolveQuestion", () => {
  it("settles the Case the question was resolved in after the screen moves to another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useResolveQuestion(),
      serverFn,
      variables: {
        ...SCOPE_A,
        questionId: testId(30),
        resolvedNote: "Found in WHOIS",
      },
    });
  });
});
