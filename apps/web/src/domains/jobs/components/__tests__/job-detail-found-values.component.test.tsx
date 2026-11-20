import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobDetail } from "@/domains/jobs/components/job-detail";
import { buildJobRecord } from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import type { FoundValueRecord, JobFoundValues } from "@watchdog/schemas/jobs";
import { testId } from "@watchdog/test-kit";

const listJobFoundValuesFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/jobs/jobs.functions", () => ({
  listJobFoundValuesFn,
  listJobProviderCallsFn: vi.fn(),
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

function value(
  type: FoundValueRecord["type"],
  text: string,
  sources: string[],
  onEntities: FoundValueRecord["onEntities"] = []
): FoundValueRecord {
  return { type, platform: "", value: text, sources, onEntities };
}

const domains = Array.from({ length: 20 }, (_, i) =>
  value("domain", `h${i}.acme.test`, ["Certificate name"])
);

const FOUND: JobFoundValues = {
  hasReader: true,
  values: [
    value("ip", "192.0.2.1", ["A record"]),
    value(
      "ip",
      "192.0.2.2",
      ["A record"],
      [{ id: testId(11), name: "Alice", slug: "alice" }]
    ),
    ...domains,
  ],
  total: 22,
  isTruncated: false,
};

async function openFoundTab(onAddFoundValue?: (v: FoundValueRecord) => void) {
  const user = userEvent.setup();
  render(
    <JobDetail
      job={buildJobRecord({ status: "running" })}
      isBusy={false}
      onCancel={vi.fn()}
      onAddFoundValue={onAddFoundValue}
    />,
    { wrapper: Providers }
  );
  await user.click(screen.getByRole("tab", { name: "Found" }));
  return user;
}

describe("JobDetail Found tab", () => {
  beforeEach(() => {
    listJobFoundValuesFn.mockReset();
  });

  it("groups every found value by type, names who holds one, and collapses a big group", async () => {
    listJobFoundValuesFn.mockResolvedValue(FOUND);
    const user = await openFoundTab();

    expect(await screen.findByText(/22 values\./)).toBeInTheDocument();
    expect(screen.getByText("192.0.2.2")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("1 already on Entities")).toBeInTheDocument();

    const domainGroup = screen.getByRole("button", { name: "Domain (20)" });
    expect(domainGroup).toHaveAttribute("aria-expanded", "false");
    await user.click(domainGroup);
    expect(screen.getByText("h0.acme.test")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Filter found values"), "h19");
    expect(screen.queryByText("192.0.2.1")).not.toBeInTheDocument();
    expect(screen.getByText("h19.acme.test")).toBeInTheDocument();
  });

  it("hands a value to the screen's Add to Entity, and offers no Add without it", async () => {
    listJobFoundValuesFn.mockResolvedValue(FOUND);
    const onAdd = vi.fn();
    const user = await openFoundTab(onAdd);

    await user.click(
      await screen.findByRole("button", { name: "Add 192.0.2.1 to an Entity" })
    );
    expect(onAdd).toHaveBeenCalledWith(FOUND.values[0]);
  });

  it("says when the Cap lists no found values", async () => {
    listJobFoundValuesFn.mockResolvedValue({
      hasReader: false,
      values: [],
      total: 0,
      isTruncated: false,
    });
    await openFoundTab();
    expect(await screen.findByText("Not finished yet")).toBeInTheDocument();
  });
});
