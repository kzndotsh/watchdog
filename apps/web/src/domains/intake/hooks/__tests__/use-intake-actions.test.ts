import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/ui/shadcn/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/domains/intake/intake.functions", () => ({
  processEvidenceFn: vi.fn(),
  enrichUrlEvidenceFn: vi.fn(),
  softDeleteEvidenceFn: vi.fn(),
  restoreEvidenceFn: vi.fn(),
  attachEvidenceEntityFn: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEvidenceMutation: vi.fn().mockResolvedValue(undefined),
  invalidateAfterJobMutation: vi.fn().mockResolvedValue(undefined),
}));

const useDumpEvidenceMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const processMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const enrichMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const deleteMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const restoreMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const attachMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock("@/domains/intake/hooks/use-dump-evidence", () => ({
  useDumpEvidence: (...args: unknown[]) => useDumpEvidenceMock(...args),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

import { useIntakeActions } from "@/domains/intake/hooks/use-intake-actions";

const intakeMutations = [
  processMutation,
  enrichMutation,
  deleteMutation,
  restoreMutation,
  attachMutation,
] as const;

useMutationMock.mockImplementation(() => {
  const idx = (useMutationMock.mock.calls.length - 1) % intakeMutations.length;
  return intakeMutations[idx] ?? processMutation;
});

function mockDump() {
  useDumpEvidenceMock.mockReturnValue({
    dumpError: null,
    clearDumpError: vi.fn(),
    busy: false,
    uploading: false,
    uploadStatus: null,
    dumpingPaste: false,
    dumpingUrl: false,
    onFiles: vi.fn(),
    onPaste: vi.fn(),
    onUrl: vi.fn(),
  });
}

function renderIntakeActions(selectedEvidenceId: string | null = testId(40)) {
  mockDump();

  const onEvidenceIdChange = vi.fn();
  const closeDumpModal = vi.fn();
  const onRestoreShowActiveQueue = vi.fn();
  const client = new QueryClient();

  const view = renderHook(
    () =>
      useIntakeActions({
        caseId: testId(10),
        selectedEvidenceId,
        onEvidenceIdChange,
        closeDumpModal,
        onRestoreShowActiveQueue,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    }
  );

  return {
    ...view,
    onEvidenceIdChange,
    closeDumpModal,
    onRestoreShowActiveQueue,
  };
}

describe("useIntakeActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDump();
  });

  it("exposes dump handlers and idle evidence actions", () => {
    const { result } = renderIntakeActions();

    expect(result.current.busy).toBe(false);
    expect(result.current.actionError).toBeNull();
    expect(result.current.onFiles).toBeTypeOf("function");
    expect(result.current.evidenceActions.processing).toBe(false);
  });

  it("starts harvest and hide mutations for the selected evidence row", () => {
    const evidenceId = testId(40);
    const { result } = renderIntakeActions(evidenceId);

    act(() => {
      result.current.evidenceActions.onProcess();
    });
    expect(processMutation.mutate).toHaveBeenCalledWith({ evidenceId });

    act(() => {
      result.current.evidenceActions.onAiProcess();
    });
    expect(processMutation.mutate).toHaveBeenCalledWith({
      evidenceId,
      ai: true,
    });

    act(() => {
      result.current.evidenceActions.onHide();
    });
    expect(deleteMutation.mutate).toHaveBeenCalledWith(evidenceId);
  });

  it("clears or advances selection after hide succeeds", async () => {
    const evidenceId = testId(40);
    const nextRowId = testId(41);
    const onEvidenceIdChange = vi.fn();
    const resolveSelectionAfterHide = vi.fn(() => nextRowId);
    mockDump();

    const client = new QueryClient();
    useMutationMock.mockImplementation((config) => {
      const idx =
        (useMutationMock.mock.calls.length - 1) % intakeMutations.length;
      const mutation = intakeMutations[idx] ?? processMutation;
      if (mutation === deleteMutation && config?.onSuccess) {
        return {
          ...deleteMutation,
          mutate: (id: string) => {
            void Promise.resolve(config.onSuccess(undefined, id, undefined));
          },
        };
      }
      return mutation;
    });

    const { result } = renderHook(
      () =>
        useIntakeActions({
          caseId: testId(10),
          selectedEvidenceId: evidenceId,
          onEvidenceIdChange,
          resolveSelectionAfterHide,
          closeDumpModal: vi.fn(),
          onRestoreShowActiveQueue: vi.fn(),
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      }
    );

    await act(async () => {
      result.current.evidenceActions.onHide();
    });

    expect(resolveSelectionAfterHide).toHaveBeenCalledWith(evidenceId);
    expect(onEvidenceIdChange).toHaveBeenCalledWith(nextRowId);
  });

  it("ignores evidence actions when nothing is selected", () => {
    const { result } = renderIntakeActions(null);

    act(() => {
      result.current.evidenceActions.onProcess();
      result.current.evidenceActions.onEnrich();
    });

    expect(processMutation.mutate).not.toHaveBeenCalled();
    expect(enrichMutation.mutate).not.toHaveBeenCalled();
  });

  it("attaches entity changes through the attach mutation", () => {
    const evidenceId = testId(40);
    const entityId = testId(20);
    const { result } = renderIntakeActions(evidenceId);

    act(() => {
      result.current.evidenceActions.onAttachEntity(entityId);
    });

    expect(attachMutation.mutate).toHaveBeenCalledWith({
      evidenceId,
      entityId,
    });
  });
});
