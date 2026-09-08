import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@/domains/intake/lib/upload-file", () => ({
  uploadFileEvidence: vi.fn(),
}));

vi.mock("@/domains/intake/intake.functions", () => ({
  dumpPasteFn: vi.fn(),
  dumpUrlFn: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEvidenceMutation: vi.fn().mockResolvedValue(undefined),
}));

import { toast } from "sonner";

import { uploadFileEvidence } from "@/domains/intake/lib/upload-file";
import { invalidateAfterEvidenceMutation } from "@/shared/lib/query-invalidation";

const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

import { useDumpEvidence } from "@/domains/intake/hooks/use-dump-evidence";

function renderDumpHook() {
  const mutations: {
    mutate: ReturnType<typeof vi.fn>;
    isPending: boolean;
  }[] = [];
  useMutationMock.mockImplementation(() => {
    const mutation = { mutate: vi.fn(), isPending: false };
    mutations.push(mutation);
    return mutation;
  });

  const client = new QueryClient();
  const view = renderHook(
    () =>
      useDumpEvidence({
        caseId: testId(10),
        entityId: "",
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    }
  );

  return { ...view, mutations };
}

describe("useDumpEvidence", () => {
  it("starts idle with no dump error", () => {
    const { result } = renderDumpHook();

    expect(result.current.busy).toBe(false);
    expect(result.current.dumpError).toBeNull();
    expect(result.current.uploadStatus).toBeNull();
  });

  it("forwards selected files to the upload mutation", () => {
    const { result, mutations } = renderDumpHook();
    const file = new File(["x"], "a.txt", { type: "text/plain" });

    act(() => {
      result.current.onFiles([file]);
    });

    expect(mutations[0]?.mutate).toHaveBeenCalledWith([file]);
    expect(result.current.uploading).toBe(false);
  });

  it("keeps successful uploads when a later file fails", async () => {
    const onSuccess = vi.fn();
    const good = new File(["a"], "good.txt", { type: "text/plain" });
    const bad = new File(["b"], "bad.txt", { type: "text/plain" });
    const created = { id: testId(40), title: "good.txt" };
    vi.mocked(uploadFileEvidence)
      .mockResolvedValueOnce(created as never)
      .mockRejectedValueOnce(new Error("network"));

    let mutationOptions: {
      mutationFn: (files: File[]) => Promise<{
        created: unknown[];
        failures: { name: string; message: string }[];
      }>;
      onSuccess: (result: {
        created: unknown[];
        failures: { name: string; message: string }[];
      }) => Promise<void>;
    } | null = null;
    useMutationMock.mockImplementation(
      (options: NonNullable<typeof mutationOptions>) => {
        mutationOptions ??= options;
        return {
          mutate: (files: File[]) => {
            void options.mutationFn(files).then((result) => {
              void options.onSuccess(result);
            });
          },
          isPending: false,
        };
      }
    );

    const client = new QueryClient();
    const { result } = renderHook(
      () =>
        useDumpEvidence({
          caseId: testId(10),
          entityId: "",
          onSuccess,
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      }
    );

    await act(async () => {
      result.current.onFiles([good, bad]);
      await mutationOptions?.mutationFn([good, bad]);
      await mutationOptions?.onSuccess({
        created: [created],
        failures: [{ name: "bad.txt", message: "network" }],
      });
    });

    expect(invalidateAfterEvidenceMutation).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith([created]);
    expect(toast.warning).toHaveBeenCalledWith("1 of 2 files uploaded");
    expect(result.current.dumpError).toContain("bad.txt");
  });
});
