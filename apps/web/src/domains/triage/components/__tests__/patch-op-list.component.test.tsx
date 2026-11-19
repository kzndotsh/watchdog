import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/testing/render-in-case";
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

  it("collapses a large Identifier group behind its count and opens it on click", async () => {
    const user = userEvent.setup();
    render(
      <PatchOpList
        patch={[
          ...Array.from({ length: 30 }, (_, i) => ({
            id: testId(10 + i),
            op: "create" as const,
            resource: "identifier" as const,
            data: { type: "domain", value: `h${i}.acme.test` },
          })),
          {
            id: testId(99),
            op: "create",
            resource: "claim",
            data: { text: "CT for acme.test" },
          },
        ]}
      />
    );

    const trigger = screen.getByRole("button", {
      name: "Domain Identifiers (30)",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Domain: h0.acme.test")).not.toBeInTheDocument();
    expect(screen.getByText("CT for acme.test")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByText("Domain: h0.acme.test")).toBeInTheDocument();
  });

  it("opens a large group that holds a flagged op and shows that op first", () => {
    render(
      <PatchOpList
        patch={Array.from({ length: 30 }, (_, i) => ({
          id: testId(10 + i),
          op: "create" as const,
          resource: "identifier" as const,
          data: { type: "domain", value: `h${i}.acme.test` },
        }))}
        collidingOpIds={[testId(25)]}
      />
    );

    expect(screen.getByText("1 flagged")).toBeInTheDocument();
    const rows = screen.getAllByText(/^Domain: /);
    expect(rows[0]).toHaveTextContent("Domain: h15.acme.test");
    expect(screen.getByText("On another Entity")).toBeInTheDocument();
  });
});
