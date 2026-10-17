import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/testing/render-in-case";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to?: string;
    params?: { caseSlug?: string; entitySlug?: string };
  }) => (
    <a
      href={(to ?? "#")
        .replace("$caseSlug", params?.caseSlug ?? "")
        .replace("$entitySlug", params?.entitySlug ?? "")}
    >
      {children}
    </a>
  ),
}));

import { EntityMention } from "@/shared/ui/entity-mention";
import { RouteCaseProvider } from "@/testing/route-case";

describe("EntityMention", () => {
  it("is plain text outside a Case route: there is no Case to link into", () => {
    render(<EntityMention name="Alice" slug="alice" />, {
      wrapper: ({ children }) => (
        <RouteCaseProvider routeCase={null}>{children}</RouteCaseProvider>
      ),
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders plain text without a slug", () => {
    render(<EntityMention name="Alice" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the dossier when slug is provided", () => {
    render(<EntityMention name="Alice" slug="alice" />);
    const link = screen.getByRole("link", { name: "Alice" });
    expect(link).toHaveAttribute("href", "/cases/alpha/entities/alice");
  });

  it("falls back to slug when name is blank", () => {
    render(<EntityMention name="" slug="acme-corp" />);
    const link = screen.getByRole("link", { name: "acme-corp" });
    expect(link).toHaveAttribute("href", "/cases/alpha/entities/acme-corp");
  });

  it("trims whitespace from name when slug is omitted", () => {
    render(<EntityMention name="  Alice  " />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("trims padded slug before linking", () => {
    render(<EntityMention name="Alice" slug="  alice  " />);
    const link = screen.getByRole("link", { name: "Alice" });
    expect(link).toHaveAttribute("href", "/cases/alpha/entities/alice");
  });
});
