import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  IdentifierPasteRow,
  IdentifierPasteTable,
} from "@/domains/entities/lib/parse-identifier-paste";

vi.mock("@/auth/server", () => ({ auth: {} }));

const createIdentifierFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  createIdentifierFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useBulkAddIdentifiersImport } from "../use-bulk-add-identifiers-import";

const CASE_A = "550e8400-e29b-41d4-a716-446655440000";
const CASE_B = "550e8400-e29b-41d4-a716-446655440001";
const ENTITY_ID = "550e8400-e29b-41d4-a716-446655440002";

const row: IdentifierPasteRow = {
  sourceIndex: 0,
  columnIndex: 0,
  sourceLine: "a@example.com",
  entityId: ENTITY_ID,
  entityName: "Acme",
  entityError: null,
  type: "email",
  value: "a@example.com",
  platform: "",
  status: "current",
  confidence: "possible",
  error: null,
  note: null,
};

const table: IdentifierPasteTable = {
  delimiter: "none",
  hasHeader: false,
  headerLine: null,
  columnLabels: [],
  suggestedMapping: [],
  suggestedPlatforms: [],
  dataLines: ["a@example.com"],
  cells: [["a@example.com"]],
  truncated: false,
  rawDataCount: 1,
};

describe("useBulkAddIdentifiersImport", () => {
  it("reports the Case that received the rows after the screen moves to another Case", async () => {
    let finish: () => void = () => undefined;
    createIdentifierFn.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const onImported = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ tag }: { tag: string }) =>
        useBulkAddIdentifiersImport({
          onImported: async (ids, caseId) => {
            await onImported(tag, ids, caseId);
          },
          onClose: vi.fn(),
          retainFailedImport: vi.fn(),
        }),
      { wrapper, initialProps: { tag: CASE_A } }
    );

    act(() => {
      result.current.mutate({ caseId: CASE_A, rows: [row], table });
    });
    rerender({ tag: CASE_B });
    await waitFor(() => {
      expect(createIdentifierFn).toHaveBeenCalled();
    });
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith(CASE_B, [ENTITY_ID], CASE_A);
    });
    expect(createIdentifierFn).toHaveBeenCalledWith({
      data: expect.objectContaining({ caseId: CASE_A, entityId: ENTITY_ID }),
    });
  });
});
