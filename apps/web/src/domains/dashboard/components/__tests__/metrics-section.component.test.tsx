import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { workHref } from "@/config/nav";
import { MetricsSection } from "@/domains/dashboard/components/metrics-section";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: { caseSlug: string };
    children: React.ReactNode;
    className?: string;
  }) => (
    <a
      href={to.replace("$caseSlug", params?.caseSlug ?? "")}
      className={className}
    >
      {children}
    </a>
  ),
}));

describe("MetricsSection", () => {
  it("renders metric tiles with labels and values", () => {
    render(
      <MetricsSection
        tiles={[
          {
            id: "jobs",
            label: "Jobs",
            value: 3,
            hint: "live",
            to: workHref("collect", "alpha"),
            tone: "warn",
          },
        ]}
      />
    );
    expect(screen.getByLabelText("Overview")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Jobs")).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/cases/alpha/collect"
    );
    expect(
      screen.getByRole("region", { name: "Overview" })
    ).toBeInTheDocument();
  });
});
