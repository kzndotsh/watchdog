import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EntityRecord } from "@/domains/entities/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/entities.functions", () => ({
  updateEntityFieldsFn: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/ui/rich-text", () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
    placeholder,
  }: {
    value: string;
    onChange: (next: string) => void;
    ariaLabel?: string;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={ariaLabel ?? placeholder ?? "Rich text editor"}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  ),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

import {
  NotesSection,
  SummarySection,
} from "@/domains/dossier/components/summary-notes-section";

const ENTITY: EntityRecord = {
  id: testId(1),
  caseId: testId(10),
  slug: "alpha",
  name: "Alpha Entity",
  kind: "person",
  summary: "Lead subject",
  notes: "Working notes",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("summary-notes sections", () => {
  it("renders SummarySection with seeded BLUF copy", () => {
    renderWithClient(<SummarySection caseId={testId(10)} entity={ENTITY} />);
    expect(
      screen.getByRole("heading", { name: "Summary" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Summary")).toHaveValue("Lead subject");
  });

  it("renders NotesSection with seeded working notes", () => {
    renderWithClient(<NotesSection caseId={testId(10)} entity={ENTITY} />);
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toHaveValue("Working notes");
  });
});
