import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@/routes/_protected/ui/-guide-chrome", () => ({
  GuideToc: () => <div>Guide toc</div>,
  GuideSection: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock("@/routes/_protected/ui/-section-atoms", () => ({
  AtomsSection: () => <div>Atoms section</div>,
}));

vi.mock("@/routes/_protected/ui/-section-sidebar-footer", () => ({
  SidebarFooterSection: () => <div>Sidebar footer section</div>,
}));

vi.mock("@/routes/_protected/ui/-section-task-cards", () => ({
  TaskCardsSection: () => <div>Task cards section</div>,
}));

vi.mock("@/routes/_protected/ui/-section-foundations", () => ({
  FoundationsSection: () => <div>Foundations section</div>,
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/layout/page-header", () => ({
  PageHeader: () => <div>Style guide header</div>,
}));

import { Route } from "@/routes/_protected/ui/index";

describe("ui style guide route", () => {
  it("renders the style guide page sections", () => {
    const Page = Route.options.component!;
    // The Lists section is real: it runs on in-memory data and needs only a QueryClient.
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>
    );

    expect(screen.getByText("Style guide header")).toBeInTheDocument();
    expect(screen.getByText("Guide toc")).toBeInTheDocument();
    expect(screen.getByText("Foundations section")).toBeInTheDocument();
    expect(screen.getByText("Atoms section")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lists" })).toBeInTheDocument();
    expect(screen.getByText("Sidebar footer section")).toBeInTheDocument();
    expect(screen.getByText("Task cards section")).toBeInTheDocument();
  });
});
