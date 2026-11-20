import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const countIdentifierTypesFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  listIdentifiersPageFn: vi.fn(),
  countIdentifierTypesFn,
}));

import { IdentifierTypeGroups } from "@/domains/entities/components/identifier-type-groups";
import { identifierList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testCaseId(10);
const ENTITY_A = testId(20);
const ENTITY_B = testId(21);

const EMAIL_COUNTS: Readonly<Record<string, number>> = {
  [ENTITY_A]: 1,
  [ENTITY_B]: 100,
};

function groupsOf(entityId: string) {
  return (
    <IdentifierTypeGroups
      caseId={CASE_ID}
      query={identifierList.queryOf({}, { entityId })}
      renderGroup={(type) => <p>{`${entityId} ${type} rows`}</p>}
    />
  );
}

describe("IdentifierTypeGroups", () => {
  it("opens another Entity's groups by its own counts, even when they are cached", async () => {
    countIdentifierTypesFn.mockImplementation(
      async ({ data }: { data: { entityId: string } }) => ({
        // A second group, so the only-group rule never opens the big one.
        counts: [
          { type: "domain", count: 3 },
          { type: "email", count: EMAIL_COUNTS[data.entityId] ?? 0 },
        ],
        isCapped: false,
      })
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrap = (node: React.ReactNode) => (
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    );
    const { rerender } = render(wrap(groupsOf(ENTITY_B)));
    await screen.findByRole("button", { name: "Email (100)" });
    rerender(wrap(groupsOf(ENTITY_A)));
    expect(
      await screen.findByRole("button", { name: "Email (1)" })
    ).toHaveAttribute("aria-expanded", "true");

    // B's counts are cached now: the switch never shows a loading state.
    rerender(wrap(groupsOf(ENTITY_B)));

    expect(
      await screen.findByRole("button", { name: "Email (100)" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText(`${ENTITY_B} email rows`)
    ).not.toBeInTheDocument();
  });
});
