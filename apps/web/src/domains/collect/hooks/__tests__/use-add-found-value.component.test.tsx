import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useAddFoundValue } from "@/domains/collect/hooks/use-add-found-value";
import { jobsKeys } from "@/domains/jobs/jobs-keys";
import { procedureDouble } from "@/testing/orpc-client";
import { buildCaseIdentifierRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

const createIdentifier = procedureDouble("identifiers.create");

const CASE_ID = testCaseId(1);
const JOB_ID = testId(2);
const EVIDENCE_ID = testId(3);

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onError = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      useAddFoundValue({
        caseId: CASE_ID,
        jobId: JOB_ID,
        evidenceIds: [EVIDENCE_ID],
        onError,
      }),
    { wrapper }
  );
  return { result, invalidate, onError };
}

const VALUE = {
  type: "domain" as const,
  platform: "",
  value: "vpn.acme.test",
  sources: ["Certificate name"],
  onEntities: [],
};

describe("useAddFoundValue", () => {
  it("adds the value at Unverified citing the Job's Evidence, then refreshes the Found list", async () => {
    createIdentifier.mockResolvedValue(
      buildCaseIdentifierRecord({ id: testId(9) })
    );
    const { result, invalidate } = setup();

    let isAdded = false;
    await act(async () => {
      isAdded = await result.current.add(VALUE, {
        id: testId(11),
        slug: "acme",
      });
    });

    expect(isAdded).toBe(true);
    expect(createIdentifier).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: CASE_ID,
        entityId: testId(11),
        type: "domain",
        value: "vpn.acme.test",
        status: "unknown",
        confidence: "unverified",
        evidenceIds: [EVIDENCE_ID],
      })
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: jobsKeys.found(CASE_ID, JOB_ID),
    });
  });

  it("reports a failed write and leaves the Found list alone", async () => {
    createIdentifier.mockRejectedValue(new Error("boom"));
    const { result, invalidate, onError } = setup();

    let isAdded = true;
    await act(async () => {
      isAdded = await result.current.add(VALUE, {
        id: testId(11),
        slug: "acme",
      });
    });

    expect(isAdded).toBe(false);
    expect(onError).toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: jobsKeys.found(CASE_ID, JOB_ID),
    });
  });
});
