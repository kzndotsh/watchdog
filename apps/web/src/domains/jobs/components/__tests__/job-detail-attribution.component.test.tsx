import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { JobDetail } from "@/domains/jobs/components/job-detail";
import { buildJobRecord } from "@/testing/records";
import { render } from "@/testing/render-in-case";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

const output = [
  {
    name: "report.json",
    sha256: "abc",
    mime: "application/json",
    uri: "s3://bucket/report.json",
  },
];

const attribution = {
  text: "Data from Have I Been Pwned",
  url: "https://haveibeenpwned.com",
};

function renderDetail(credit: typeof attribution | null) {
  // The real ArtifactContent reads through a query; the artifact itself is not under test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <JobDetail
        job={buildJobRecord({ status: "succeeded", output })}
        attribution={credit}
        isBusy={false}
        onCancel={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("JobDetail provider attribution", () => {
  it("credits the provider on the output tab, as a safe external link", async () => {
    const user = userEvent.setup();

    renderDetail(attribution);
    await user.click(screen.getByRole("tab", { name: /Output/ }));

    const link = screen.getByRole("link", { name: attribution.text });
    expect(link).toHaveAttribute("href", attribution.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("report.json")).toBeInTheDocument();
  });

  it("shows no credit when the provider asks for none", async () => {
    const user = userEvent.setup();

    renderDetail(null);
    await user.click(screen.getByRole("tab", { name: /Output/ }));

    expect(screen.getByText("report.json")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Data from/ })
    ).not.toBeInTheDocument();
  });
});
