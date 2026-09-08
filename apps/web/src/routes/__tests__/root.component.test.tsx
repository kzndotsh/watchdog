import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createRootRouteWithContext: () => (options: Record<string, unknown>) => ({
      options,
    }),
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
    HeadContent: () => null,
    Scripts: () => null,
  };
});

vi.mock("@/shared/layout/providers", () => ({
  Providers: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="providers">{children}</div>
  ),
}));

vi.mock("@/shared/ui/shadcn/toast", () => ({
  Toaster: () => null,
}));

vi.mock("@/shared/ui/shadcn/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../styles.css?url", () => ({
  default: "/styles.css",
}));

import { Route } from "@/routes/__root";

const notFoundProps = {
  isNotFound: true as const,
  routeId: "__root__" as const,
};

describe("__root route", () => {
  it("renders the not-found page with a dashboard link", () => {
    const NotFound = Route.options.notFoundComponent!;
    render(<NotFound {...notFoundProps} />);

    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to dashboard" })
    ).toHaveAttribute("href", "/");
  });

  it("wraps the app in providers inside the document shell", () => {
    const Shell = (
      Route.options as typeof Route.options & {
        shellComponent: React.ComponentType<{ children: React.ReactNode }>;
      }
    ).shellComponent;
    render(
      <Shell>
        <div>Child content</div>
      </Shell>
    );

    expect(screen.getByTestId("providers")).toBeInTheDocument();
    expect(screen.getByText("Child content")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "en");
  });
});
