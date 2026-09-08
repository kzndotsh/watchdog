import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to?: string;
    params?: { entitySlug?: string };
  }) => <a href={`${to ?? "#"}/${params?.entitySlug ?? ""}`}>{children}</a>,
}));

import { EntityMention } from "@/shared/ui/entity-mention";

describe("EntityMention", () => {
  it("renders plain text without a slug", () => {
    render(<EntityMention name="Alice" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the dossier when slug is provided", () => {
    render(<EntityMention name="Alice" slug="alice" />);
    const link = screen.getByRole("link", { name: "Alice" });
    expect(link).toHaveAttribute("href", "/entities/$entitySlug/alice");
  });

  it("falls back to slug when name is blank", () => {
    render(<EntityMention name="" slug="acme-corp" />);
    const link = screen.getByRole("link", { name: "acme-corp" });
    expect(link).toHaveAttribute("href", "/entities/$entitySlug/acme-corp");
  });

  it("trims whitespace from name when slug is omitted", () => {
    render(<EntityMention name="  Alice  " />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("trims padded slug before linking", () => {
    render(<EntityMention name="Alice" slug="  alice  " />);
    const link = screen.getByRole("link", { name: "Alice" });
    expect(link).toHaveAttribute("href", "/entities/$entitySlug/alice");
  });
});
