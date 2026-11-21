import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import type {
  IdentifierPasteRow,
  IdentifierPasteTable,
} from "@/domains/entities/lib/parse-identifier-paste";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { procedureDouble } from "@/testing/orpc-client";
import { buildCaseIdentifierRecord } from "@/testing/records";

import { useBulkAddIdentifiersImport } from "../use-bulk-add-identifiers-import";

const createIdentifier = procedureDouble("identifiers.create");

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
  isTruncated: false,
  rawDataCount: 1,
};

describe("useBulkAddIdentifiersImport", () => {
  it("reports the Case that received the rows after the screen moves to another Case", async () => {
    let finish: () => void = () => undefined;
    createIdentifier.mockReturnValue(
      new Promise<CaseIdentifierRecord>((resolve) => {
        finish = () => {
          resolve(buildCaseIdentifierRecord({ entityId: ENTITY_ID }));
        };
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
      expect(createIdentifier).toHaveBeenCalled();
    });
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith(CASE_B, [ENTITY_ID], CASE_A);
    });
    expect(createIdentifier).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: CASE_A, entityId: ENTITY_ID })
    );
  });
});
