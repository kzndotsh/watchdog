import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import type { ClaimRecord } from "@/domains/entities/claims/types";
import {
  matchesChoice,
  matchesQ,
  memoryListProcedure,
} from "@/testing/memory-list";
import { buildClaimRecord, buildEntityRecord } from "@/testing/records";
import { claimList } from "@watchdog/domain/schemas/graph";
import type {
  ListSearch,
  UnfixedSearchPatch,
} from "@watchdog/domain/schemas/shared";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

vi.mock("#ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    children,
  }: {
    params: { entitySlug: string };
    children: React.ReactNode;
  }) => <a href={`/entities/${params.entitySlug}`}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { ClaimsPage } from "@/domains/entities/components/claims-page";
import { procedureDouble } from "@/testing/orpc-client";
import { renderIn } from "@/testing/render-in-case";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

const listClaims = procedureDouble("claims.list");
const countClaims = procedureDouble("claims.confidenceCounts");
const getEntities = procedureDouble("entities.getMany");

const ACTIVE: CaseRecord = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const render = renderIn(ACTIVE);

const ADA = buildEntityRecord({
  id: testId(50),
  name: "Ada Byron",
  slug: "ada",
});

const CLAIMS: readonly ClaimRecord[] = [
  buildClaimRecord({
    id: testId(100),
    entityId: ADA.id,
    text: "Registered ada.example",
    confidence: "possible",
    evidenceIds: [testId(200)],
  }),
  buildClaimRecord({
    id: testId(101),
    entityId: ADA.id,
    text: "Uses the handle ada88",
    confidence: "unverified",
    evidenceIds: [],
  }),
];

type Search = ListSearch<typeof claimList>;

function Route({
  initial,
  onPatch,
}: {
  initial: Search;
  onPatch: (patch: UnfixedSearchPatch<typeof claimList, never>) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <ClaimsPage
      search={search}
      onSearchChange={(patch) => {
        onPatch(patch);
        setSearch((prev) => ({ ...prev, ...patch }));
      }}
    />
  );
}

function renderPage(initial: Search = {}) {
  listClaims.mockReset();
  listClaims.mockImplementation(
    memoryListProcedure(CLAIMS, {
      pageSize: 50,
      matches: (row, data) =>
        matchesChoice(row.confidence, data.confidence) &&
        (data.uncited !== true || row.evidenceIds.length === 0) &&
        matchesQ(data, [row.text]),
      compare: () => () => 0,
    })
  );
  countClaims.mockReset();
  countClaims.mockResolvedValue({
    counts: [
      { confidence: "possible", count: 1 },
      { confidence: "unverified", count: 1 },
    ],
    uncited: 1,
    isCapped: false,
  });
  getEntities.mockResolvedValue([ADA]);
  const onPatch = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Route initial={initial} onPatch={onPatch} />
    </QueryClientProvider>
  );
  return { onPatch };
}

beforeAll(preloadSharedLazyChunks);

describe("ClaimsPage", () => {
  it("lists the Case's Claims with their Entity and Evidence count", async () => {
    renderPage();

    expect(await screen.findByText("Registered ada.example")).toBeVisible();
    expect(screen.getByText("Uses the handle ada88")).toBeVisible();
    expect(
      await screen.findAllByRole("link", { name: "Ada Byron" })
    ).toHaveLength(2);
    expect(screen.getByText("1 Evidence")).toBeVisible();
    expect(
      within(screen.getByRole("list")).getByText("No Evidence")
    ).toBeVisible();
  });

  it("counts each tier card on the server with the tier filters cleared", async () => {
    renderPage({ confidence: ["possible"] });

    const unverified = await screen.findByRole("button", {
      name: /^Unverified/,
    });
    expect(await within(unverified).findByText("1")).toBeVisible();
    expect(
      within(screen.getByRole("button", { name: /^All/ })).getByText("2")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /^Possible/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(countClaims).toHaveBeenCalledWith({ caseId: ACTIVE.id });
  });

  it("writes the tier to the URL when a card is picked, and No Evidence as `uncited`", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPage();
    await screen.findByText("Registered ada.example");

    await user.click(screen.getByRole("button", { name: /^Unverified/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      uncited: undefined,
      confidence: ["unverified"],
    });
    await waitFor(() => {
      expect(screen.queryByText("Registered ada.example")).toBeNull();
    });
    expect(
      screen
        .getAllByRole("button", { pressed: true })
        .map((card) => card.textContent)
    ).toEqual([expect.stringMatching(/^Unverified/)]);

    await user.click(screen.getByRole("button", { name: /^No Evidence/ }));
    expect(onPatch).toHaveBeenLastCalledWith({
      uncited: true,
      confidence: undefined,
    });
  });
});
