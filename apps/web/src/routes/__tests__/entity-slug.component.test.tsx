import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const useParamsMock = vi.hoisted(() => vi.fn(() => ({ entitySlug: "target" })));
const useNavigateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({
      useParams: useParamsMock,
      useSearch: () => ({ tab: "overview" }),
      useNavigate: () => useNavigateMock,
    }),
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
    notFound: (options: unknown) => {
      throw options;
    },
  };
});

vi.mock("@/domains/dossier/components/dossier", () => ({
  Dossier: ({ entitySlug, tab }: { entitySlug: string; tab: string }) => (
    <div>
      Dossier {entitySlug} ({tab})
    </div>
  ),
}));

vi.mock("@/domains/dossier/lib/prefetch-dossier", () => ({
  warmDossierQueries: vi.fn(),
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeader: ({
    current,
    description,
  }: {
    current?: string;
    description?: React.ReactNode;
  }) => (
    <div>
      <h1>{current}</h1>
      <div>{description}</div>
    </div>
  ),
}));

import { Route } from "@/routes/_protected/entities/$entitySlug";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha Case",
  description: null,
  allowThirdPartyEgress: false,
};

const notFoundProps = {
  isNotFound: true as const,
  routeId: "/_protected/entities/$entitySlug" as const,
  data: { caseName: "Alpha Case" },
};

describe("entity slug route", () => {
  it("renders a not-found page with the active case name", () => {
    useParamsMock.mockReturnValue({ entitySlug: "missing" });
    const NotFound = Route.options.notFoundComponent!;
    render(<NotFound {...notFoundProps} />);

    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText(/Alpha Case/)).toBeInTheDocument();
  });

  it("throws notFound when the entity slug does not exist", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ active: ACTIVE, cases: [ACTIVE] })
      .mockResolvedValueOnce(null);

    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await expect(
      loader({
        context: { queryClient: { query } },
        params: { entitySlug: "missing" },
        location: { search: {} },
      } as never)
    ).rejects.toEqual(
      expect.objectContaining({
        data: { caseName: "Alpha Case" },
      })
    );
  });

  it("renders the dossier page for the entity slug", () => {
    useParamsMock.mockReturnValue({ entitySlug: "target" });
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Dossier target (overview)")).toBeInTheDocument();
  });
});
