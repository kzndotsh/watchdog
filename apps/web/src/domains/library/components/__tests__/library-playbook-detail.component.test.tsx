import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { casesContextQuery } from "@/domains/cases/queries";
import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import { LibraryPlaybookDetail } from "@/domains/library/components/library-playbook-detail";
import { buildLibraryEntries } from "@/domains/library/lib/library-entries";
import { credentialsListQuery } from "@/domains/settings/queries";
import { buildCapListItem, buildPlaybookListItem } from "@/testing/records";
import { SidebarProvider } from "@watchdog/ui/components/sidebar";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({
      location: { pathname: "/library/playbooks/recipe" },
      matches: [],
    }),
  Link: ({
    children,
    to,
    params,
    search,
    className,
  }: {
    children?: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string | undefined>;
    className?: string;
  }) => {
    let href = to;
    for (const [key, value] of Object.entries(params ?? {})) {
      href = href.replace(`$${key}`, value);
    }
    const query = Object.entries(search ?? {}).flatMap(([key, value]) =>
      value === undefined ? [] : [`${key}=${value}`]
    );
    return (
      <a
        href={query.length === 0 ? href : `${href}?${query.join("&")}`}
        className={className}
      >
        {children}
      </a>
    );
  },
}));

/** The stage column at `index` (0 is "Runs first", every later one is "Then"). */
function stageOf(index: number): HTMLElement {
  const labels = [
    screen.getByText("Runs first"),
    ...screen.queryAllByText("Then"),
  ];
  const column = labels[index]?.parentElement;
  if (column === null || column === undefined) {
    throw new Error(`no stage column ${index}`);
  }
  return column;
}

describe("LibraryPlaybookDetail", () => {
  // Step 1 (DNS) feeds step 2 (Gravatar) and step 3 (Shodan, via 2); step 4 (HIBP) stands alone.
  const caps = [
    buildCapListItem(),
    buildCapListItem({
      id: "identity.gravatar.lookup",
      title: "Gravatar lookup",
    }),
    buildCapListItem({
      id: "network.shodan.lookup",
      title: "Shodan lookup",
      credentials: [{ name: "SHODAN_API_KEY" }],
    }),
    buildCapListItem({
      id: "breach.hibp.lookup",
      title: "HIBP lookup",
      disabledReason: "breach_disabled",
    }),
  ];
  const playbooks = [
    buildPlaybookListItem({
      id: "recipe",
      title: "Recipe",
      seedKinds: ["host", "email"],
      steps: [
        "network.dns.lookup",
        "identity.gravatar.lookup",
        "network.shodan.lookup",
        "breach.hibp.lookup",
      ],
      stepDependencies: [[], [0], [0, 1], []],
    }),
  ];
  const recipeEntries = buildLibraryEntries({
    caps,
    playbooks,
    configured: new Set<string>(),
  });

  function renderRecipe() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(capabilitiesListQuery().queryKey, caps);
    client.setQueryData(playbooksListQuery().queryKey, playbooks);
    client.setQueryData(credentialsListQuery().queryKey, []);
    client.setQueryData(casesContextQuery().queryKey, {
      cases: [],
      active: null,
    });
    const entry = recipeEntries.find((e) => e.key === "playbook:recipe");
    if (entry === undefined) throw new Error("recipe entry missing");
    render(
      <QueryClientProvider client={client}>
        <SidebarProvider>
          <LibraryPlaybookDetail entry={entry} />
        </SidebarProvider>
      </QueryClientProvider>
    );
  }

  it("rolls up the steps that need keys and the ones that are off", () => {
    renderRecipe();

    expect(
      screen.getByText(
        "1 of 4 steps is missing an API key; 1 of 4 steps is off by the operator."
      )
    ).toBeInTheDocument();
  });

  it("links each seed kind to the input-kind view and each step to its Cap", () => {
    renderRecipe();

    const aside = within(screen.getByRole("complementary"));
    expect(
      aside.getAllByRole("link").map((a) => a.getAttribute("href"))
    ).toEqual(["/library?kind=domain", "/library?kind=email"]);
    expect(aside.getByText("Domain")).toBeInTheDocument();
    expect(aside.getByText("Email address")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Gravatar lookup" })
    ).toHaveAttribute("href", "/library/caps/identity.gravatar.lookup");
  });

  it("shows the chain in stages and the independent step beside the first", () => {
    renderRecipe();

    const firstStage = stageOf(0);
    // DNS (step 1) and HIBP (step 4) are independent of each other.
    expect(
      within(firstStage).getByRole("link", { name: "DNS lookup" })
    ).toBeInTheDocument();
    expect(
      within(firstStage).getByRole("link", { name: "HIBP lookup" })
    ).toBeInTheDocument();
    const second = stageOf(1);
    expect(
      within(second).getByRole("link", { name: "Gravatar lookup" })
    ).toBeInTheDocument();
    const third = stageOf(2);
    expect(
      within(third).getByRole("link", { name: "Shodan lookup" })
    ).toBeInTheDocument();
  });

  it("shows what would be skipped when a step fails", async () => {
    const user = userEvent.setup();
    renderRecipe();

    await user.click(screen.getByRole("button", { name: "Step 1" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "If step 1 fails, steps 2, 3 would be skipped."
    );
    expect(screen.getAllByText(/\(skipped\)/)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Step 4" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "If step 4 fails, no other step is skipped."
    );
    expect(screen.queryByText(/\(skipped\)/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "None" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the failure control out of the step nodes", () => {
    renderRecipe();

    expect(screen.getByText("What if a step fails?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByText(/If step \d fails$/)).not.toBeInTheDocument();
  });

  it("names each step's readiness, not a job status", () => {
    renderRecipe();

    expect(
      screen.getByRole("img", { name: "Missing API key" })
    ).toBeInTheDocument();
  });

  it("frames the steps with what you give and what you get, like a Cap", () => {
    renderRecipe();

    const give = screen.getByText("What you give").parentElement;
    if (give === null) throw new Error("no give column");
    expect(within(give).getByText("Domain")).toBeInTheDocument();
    expect(within(give).getByText("Email address")).toBeInTheDocument();
    expect(screen.getByText("What you get")).toBeInTheDocument();
  });

  it("keeps a list of kinds on one line inside a flow box", () => {
    renderRecipe();

    const give = screen.getByText("What you give").parentElement;
    if (give === null) throw new Error("no give column");
    // One inline run per box, not one flex row per link and comma.
    const run = within(give)
      .getByText(/Email address/)
      .closest("span");
    expect(run?.textContent).toBe("Domain, Email address");
  });
});
