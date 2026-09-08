import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
  }) => (
    <a href={props.to ?? "#"} {...props}>
      {children}
    </a>
  ),
}));

import { PatchOpList } from "@/domains/triage/components/patch-op-list";

describe("PatchOpList", () => {
  it("renders empty patch copy and populated change rows", () => {
    const { rerender } = render(<PatchOpList patch={[]} />);
    expect(screen.getByText("Empty patch (no ops).")).toBeInTheDocument();

    rerender(
      <PatchOpList
        patch={[
          {
            id: testId(1),
            op: "create",
            resource: "claim",
            data: { text: "Observed alias" },
          },
        ]}
        jobId={testId(99)}
      />
    );

    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.getByText("Observed alias")).toBeInTheDocument();
    expect(screen.getByText("Open in Collect")).toBeInTheDocument();
  });

  it("labels entity and identifier patch ops", () => {
    render(
      <PatchOpList
        patch={[
          {
            id: testId(2),
            op: "create",
            resource: "entity",
            data: { kind: "person", name: "Acme" },
          },
          {
            id: testId(3),
            op: "create",
            resource: "identifier",
            data: { type: "email", value: "ops@acme.test" },
          },
        ]}
      />
    );

    expect(screen.getByText("Person: Acme")).toBeInTheDocument();
    expect(screen.getByText("Email: ops@acme.test")).toBeInTheDocument();
  });
});
