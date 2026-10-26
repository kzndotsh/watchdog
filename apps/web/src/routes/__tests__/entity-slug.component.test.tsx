import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const useParamsMock = vi.hoisted(() =>
  vi.fn(() => ({ caseSlug: "alpha", entitySlug: "target" }))
);
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
    Link: ({
      to,
      params,
      children,
    }: {
      to: string;
      params?: { caseSlug: string };
      children: React.ReactNode;
    }) => (
      <a href={to.replace("$caseSlug", params?.caseSlug ?? "")}>{children}</a>
    ),
    notFound: (options: unknown) => {
      throw options;
    },
  };
});

vi.mock("@/domains/dossier/components/dossier", () => ({
  Dossier: ({
    entitySlug,
    search,
  }: {
    entitySlug: string;
    search: { tab?: string };
  }) => (
    <div>
      Dossier {entitySlug} ({search.tab})
    </div>
  ),
}));

vi.mock("@/domains/dossier/lib/prefetch-dossier", () => ({
  warmDossierQueries: vi.fn(),
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/layout/page-header", () => ({
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

import { parseDossierSearch } from "@/domains/dossier/lib/dossier-tabs";
import { warmDossierQueries } from "@/domains/dossier/lib/prefetch-dossier";
import { Route } from "@/routes/_protected/cases/$caseSlug/entities/$entitySlug";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha Case",
  description: null,
  allowedEgress: ["local", "target"],
};

const notFoundProps = {
  isNotFound: true as const,
  routeId: "/_protected/cases/$caseSlug/entities/$entitySlug" as const,
  data: { caseName: "Alpha Case" },
};

describe("entity slug route", () => {
  it("renders a not-found page with the Case name", () => {
    useParamsMock.mockReturnValue({ caseSlug: "alpha", entitySlug: "missing" });
    const NotFound = Route.options.notFoundComponent!;
    render(<NotFound {...notFoundProps} />);

    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText(/Alpha Case/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Entities" })
    ).toHaveAttribute("href", "/cases/alpha/entities");
  });

  it("throws notFound when the entity slug does not exist", async () => {
    const query = vi.fn().mockResolvedValueOnce(null);

    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await expect(
      loader({
        context: { queryClient: { query }, workCase: ACTIVE },
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
    useParamsMock.mockReturnValue({ caseSlug: "alpha", entitySlug: "target" });
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Dossier target (overview)")).toBeInTheDocument();
  });

  it("trims padded dossier tab in the search", () => {
    expect(parseDossierSearch({ tab: "  claims  " })).toEqual({
      tab: "claims",
    });
  });

  it("keeps a valid dossier tab and drops an invalid one in the search", () => {
    expect(parseDossierSearch({ tab: "connections" })).toEqual({
      tab: "connections",
    });
    expect(parseDossierSearch({ tab: "bogus" }).tab).toBeUndefined();
    expect(parseDossierSearch({}).tab).toBeUndefined();
  });

  it("keeps only the active tab's list params, never the fixed Entity", () => {
    const raw = {
      tab: "identifiers",
      type: ["email"],
      kind: ["file"],
      sort: "value.desc",
      q: "acme",
      entityId: testId(9),
      id: testId(8),
    };
    expect(parseDossierSearch(raw)).toEqual({
      tab: "identifiers",
      type: ["email"],
      sort: "value.desc",
      q: "acme",
    });
    expect(parseDossierSearch({ ...raw, tab: "evidence" })).toEqual({
      tab: "evidence",
      kind: ["file"],
      q: "acme",
      id: testId(8),
    });
    // Another list's sort is dropped, an unusable selection too.
    expect(
      parseDossierSearch({ tab: "evidence", sort: "value.desc", id: "nope" })
    ).toEqual({ tab: "evidence" });
    // Every list tab parses its own list's params: the Claims tab keeps `q`, drops the rest.
    expect(parseDossierSearch({ ...raw, tab: "claims" })).toEqual({
      tab: "claims",
      q: "acme",
    });
    expect(
      parseDossierSearch({
        tab: "connections",
        predicate: ["owns"],
        sort: "updated.desc",
        entityId: testId(9),
      })
    ).toEqual({
      tab: "connections",
      predicate: ["owns"],
      sort: "updated.desc",
    });
    expect(
      parseDossierSearch({
        tab: "questions",
        status: ["open"],
        type: ["email"],
      })
    ).toEqual({ tab: "questions", status: ["open"] });
    expect(parseDossierSearch({ tab: "notes", q: "acme" })).toEqual({
      tab: "notes",
    });
  });

  it("warms the Entity's tab data whatever the tab, never by tab (#559: no picker warm)", async () => {
    const entity = { id: testId(20), slug: "target" };
    const query = vi.fn().mockResolvedValueOnce(entity);
    const warmMock = vi.mocked(warmDossierQueries);
    warmMock.mockClear();

    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;
    await loader({
      context: { queryClient: { query }, workCase: ACTIVE },
      params: { entitySlug: "target" },
      location: { search: { tab: "  claims  " } },
    } as never);

    expect(warmMock).toHaveBeenCalledWith(
      expect.anything(),
      ACTIVE.id,
      entity.id
    );
  });
});
