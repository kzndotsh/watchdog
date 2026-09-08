import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  NotesSection,
  SummarySection,
} from "@/domains/dossier/components/summary-notes-section";
import { updateEntityFieldsFn } from "@/domains/entities/entities.functions";
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
    onBlurShell,
    ariaLabel,
    placeholder,
  }: {
    value: string;
    onChange: (next: string) => void;
    onBlurShell?: () => void;
    ariaLabel?: string;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={ariaLabel ?? placeholder ?? "Rich text editor"}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onBlur={() => {
        onBlurShell?.();
      }}
    />
  ),
}));

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

  it("saves only notes without sending summary", async () => {
    const updateFn = vi.mocked(updateEntityFieldsFn);
    updateFn.mockResolvedValue(ENTITY);
    renderWithClient(<NotesSection caseId={testId(10)} entity={ENTITY} />);
    const notes = screen.getByLabelText("Notes");
    fireEvent.change(notes, { target: { value: "Updated notes" } });
    fireEvent.blur(notes);
    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledWith({
        data: {
          caseId: testId(10),
          entityId: testId(1),
          notes: "Updated notes",
        },
      });
    });
  });

  it("saves only summary without sending notes", async () => {
    const updateFn = vi.mocked(updateEntityFieldsFn);
    updateFn.mockResolvedValue(ENTITY);
    renderWithClient(<SummarySection caseId={testId(10)} entity={ENTITY} />);
    const summary = screen.getByLabelText("Summary");
    fireEvent.change(summary, { target: { value: "Updated summary" } });
    fireEvent.blur(summary);
    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledWith({
        data: {
          caseId: testId(10),
          entityId: testId(1),
          summary: "Updated summary",
        },
      });
    });
  });

  it("clears summary with null on blur", async () => {
    const updateFn = vi.mocked(updateEntityFieldsFn);
    updateFn.mockResolvedValue({ ...ENTITY, summary: null });
    renderWithClient(<SummarySection caseId={testId(10)} entity={ENTITY} />);
    const summary = screen.getByLabelText("Summary");
    fireEvent.change(summary, { target: { value: "" } });
    fireEvent.blur(summary);
    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledWith({
        data: {
          caseId: testId(10),
          entityId: testId(1),
          summary: null,
        },
      });
    });
  });

  it("clears notes with null on blur", async () => {
    const updateFn = vi.mocked(updateEntityFieldsFn);
    updateFn.mockResolvedValue({ ...ENTITY, notes: null });
    renderWithClient(<NotesSection caseId={testId(10)} entity={ENTITY} />);
    const notes = screen.getByLabelText("Notes");
    fireEvent.change(notes, { target: { value: "" } });
    fireEvent.blur(notes);
    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledWith({
        data: {
          caseId: testId(10),
          entityId: testId(1),
          notes: null,
        },
      });
    });
  });
});
