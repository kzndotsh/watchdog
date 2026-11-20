import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/testing/render-in-case";
import {
  buildClaimCreateOp,
  buildEntityCreateOp,
  buildIdentifierCreateOp,
} from "@watchdog/schemas/testing";
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

const ENTITY = testId(50);

/** Thirty domain Identifier ops on one Entity (`h0.acme.test` …). */
function domainOps() {
  return Array.from({ length: 30 }, (_, i) =>
    buildIdentifierCreateOp(ENTITY, "domain", `h${i}.acme.test`, {
      id: testId(10 + i),
    })
  );
}

describe("PatchOpList", () => {
  it("renders empty patch copy and populated change rows", () => {
    const { rerender } = render(<PatchOpList patch={[]} />);
    expect(screen.getByText("Empty patch (no ops).")).toBeInTheDocument();

    rerender(
      <PatchOpList
        patch={[
          buildClaimCreateOp(ENTITY, "Observed alias", { id: testId(1) }),
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
          buildEntityCreateOp("Acme", "acme", "person", { id: testId(2) }),
          buildIdentifierCreateOp(ENTITY, "email", "ops@acme.test", {
            id: testId(3),
          }),
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
          ...domainOps(),
          buildClaimCreateOp(ENTITY, "CT for acme.test", { id: testId(99) }),
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
    render(<PatchOpList patch={domainOps()} collidingOpIds={[testId(25)]} />);

    expect(screen.getByText("1 flagged")).toBeInTheDocument();
    const rows = screen.getAllByText(/^Domain: /);
    expect(rows[0]).toHaveTextContent("Domain: h15.acme.test");
    expect(screen.getByText("On another Entity")).toBeInTheDocument();
  });

  it("opens a collapsed group when one of its ops becomes flagged", () => {
    const patch = domainOps();
    const { rerender } = render(<PatchOpList patch={patch} />);
    const name = "Domain Identifiers (30)";
    expect(screen.getByRole("button", { name })).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    rerender(<PatchOpList patch={patch} collidingOpIds={[testId(12)]} />);
    expect(screen.getByRole("button", { name })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
