import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobDetail } from "@/domains/jobs/components/job-detail";
import {
  buildJobRecord,
  buildProviderCallList,
  buildProviderCallRecord,
} from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import { testId } from "@watchdog/test-kit";

const listJobProviderCallsFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/jobs/jobs.functions", () => ({
  listJobProviderCallsFn,
  getJobFn: vi.fn(),
  getPlaybookRunFn: vi.fn(),
  listCapabilitiesFn: vi.fn(),
  listJobsFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <RouteCaseProvider>{children}</RouteCaseProvider>
    </QueryClientProvider>
  );
}

function renderJob(job = buildJobRecord({ status: "succeeded" })) {
  return render(<JobDetail job={job} isBusy={false} onCancel={vi.fn()} />, {
    wrapper: Providers,
  });
}

describe("JobDetail provider calls", () => {
  beforeEach(() => {
    listJobProviderCallsFn.mockReset();
  });

  it("reads the Job's calls only once the Calls tab is open", async () => {
    const user = userEvent.setup();
    listJobProviderCallsFn.mockResolvedValue(buildProviderCallList());
    const job = buildJobRecord({ status: "succeeded" });

    renderJob(job);

    expect(listJobProviderCallsFn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Calls" }));

    expect(
      await screen.findByText("https://provider.test/v1/host?key=[redacted]")
    ).toBeInTheDocument();
    expect(listJobProviderCallsFn).toHaveBeenCalledWith({
      data: { caseId: job.caseId, jobId: job.id },
    });
  });

  it("shows a cache hit with its source Job", async () => {
    const user = userEvent.setup();
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        calls: [],
        cacheHits: [{ jobId: testId(11), sourceJobId: testId(77) }],
      })
    );

    renderJob(buildJobRecord({ status: "succeeded", fromCache: true }));
    await user.click(screen.getByRole("tab", { name: "Calls" }));

    expect(
      await screen.findByText(/this Job reused a cached result/)
    ).toBeInTheDocument();
  });

  it("shows incomplete provenance as such", async () => {
    const user = userEvent.setup();
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        provenance: "incomplete",
        calls: [buildProviderCallRecord({ outcome: null, body: null })],
      })
    );

    renderJob(buildJobRecord({ status: "failed" }));
    await user.click(screen.getByRole("tab", { name: "Calls" }));

    expect(
      await screen.findByText(/provider-call record is incomplete/)
    ).toBeInTheDocument();
    expect(screen.getByText("No outcome recorded")).toBeInTheDocument();
  });
});
