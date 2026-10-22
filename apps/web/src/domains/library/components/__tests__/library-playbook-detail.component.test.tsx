import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LibraryPlaybookDetail } from "@/domains/library/components/library-playbook-detail";
import { buildLibraryEntries } from "@/domains/library/lib/library-entries";
import { buildCapListItem, buildPlaybookListItem } from "@/testing/records";

vi.mock("@tanstack/react-router", () => ({
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

describe("LibraryPlaybookDetail", () => {
  // Step 1 (DNS) feeds step 2 (Gravatar) and step 3 (Shodan, via 2); step 4 (HIBP) stands alone.
  const recipeEntries = buildLibraryEntries({
    caps: [
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
    ],
    playbooks: [
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
    ],
    configured: new Set<string>(),
  });

  function renderRecipe() {
    const entry = recipeEntries.find((e) => e.key === "playbook:recipe")!;
    render(<LibraryPlaybookDetail entry={entry} />);
  }

  it("rolls up the steps that need keys and the ones that are off", () => {
    renderRecipe();

    expect(
      screen.getByText(
        "1 of 4 steps needs a key; 1 of 4 steps is off by the operator."
      )
    ).toBeInTheDocument();
  });

  it("links each seed kind to the input-kind view and each step to its Cap", () => {
    renderRecipe();

    const seeds = screen.getByRole("heading", {
      name: "Starts from",
    }).parentElement!;
    expect(within(seeds).getByText("Domain")).toBeInTheDocument();
    expect(within(seeds).getByText("Email address")).toBeInTheDocument();
    expect(
      within(seeds)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href"))
    ).toEqual(["/library?kind=domain", "/library?kind=email"]);
    expect(
      screen.getByRole("link", { name: "Gravatar lookup" })
    ).toHaveAttribute("href", "/library/caps/identity.gravatar.lookup");
  });

  it("shows the chain in stages and the independent step beside the first", () => {
    renderRecipe();

    expect(screen.getByText("First: needs only the seed")).toBeInTheDocument();
    expect(screen.getByText(/Reads from step 1\./)).toBeInTheDocument();
    expect(screen.getByText(/Reads from steps 1, 2\./)).toBeInTheDocument();
    // DNS (step 1) and HIBP (step 4) are independent of each other.
    expect(screen.getAllByText(/Independent of step 4\./)).toHaveLength(3);
    expect(
      screen.getByText(/Independent of steps 1, 2, 3\./)
    ).toBeInTheDocument();
  });

  it("shows what would be skipped when a step fails", async () => {
    const user = userEvent.setup();
    renderRecipe();

    await user.click(screen.getByRole("button", { name: "If step 1 fails" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Step 1 (DNS lookup) failing skips step 2 (Gravatar lookup), step 3 (Shodan lookup)."
    );

    await user.click(screen.getByRole("button", { name: "If step 4 fails" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Step 4 (HIBP lookup) failing skips no other step."
    );
  });
});
