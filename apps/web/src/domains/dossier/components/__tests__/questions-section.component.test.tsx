import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { QuestionRecord } from "@/domains/entities/questions/questions.functions";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  createQuestionFn: vi.fn(),
  updateQuestionFn: vi.fn(),
  resolveQuestionFn: vi.fn(),
  reopenQuestionFn: vi.fn(),
  deleteQuestionFn: vi.fn(),
}));

vi.mock("@/shared/ui/shadcn/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

import { QuestionsSection } from "@/domains/dossier/components/questions-section";

function queryLoaded<T>(data: T) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
}

const OPEN: QuestionRecord = {
  id: testId(1),
  entityId: testId(20),
  text: "Who owns the domain?",
  status: "open",
  resolvedNote: null,
};

const RESOLVED: QuestionRecord = {
  id: testId(2),
  entityId: testId(20),
  text: "Where were they registered?",
  status: "resolved",
  resolvedNote: "Found in WHOIS",
};

function renderSection(questions: QuestionRecord[]) {
  useQueryMock.mockReturnValue(queryLoaded(questions));
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <QuestionsSection
        caseId={testId(10)}
        entityId={testId(20)}
        entitySlug="alpha"
      />
    </QueryClientProvider>
  );
}

describe("QuestionsSection", () => {
  it("shows inline empty copy when there are no questions", () => {
    renderSection([]);
    expect(
      screen.getByText("No questions — add what needs investigating.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders open and resolved question rows", () => {
    renderSection([OPEN, RESOLVED]);
    expect(screen.getByText("Who owns the domain?")).toBeInTheDocument();
    expect(screen.getByText("Where were they registered?")).toBeInTheDocument();
    expect(screen.getByText("Q01")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.getByText("→ Found in WHOIS")).toBeInTheDocument();
  });
});
