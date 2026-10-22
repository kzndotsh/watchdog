import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LibrarySplit } from "@/domains/library/components/library-split";
import { buildLibraryEntries } from "@/domains/library/lib/library-entries";
import {
  buildCapListItem,
  buildPlaybookListItem,
  testCapProvider,
} from "@/testing/records";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    className,
  }: {
    children?: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const entries = buildLibraryEntries({
  caps: [
    buildCapListItem({
      id: "network.shodan.lookup",
      title: "Shodan lookup",
      egress: "third_party",
      provider: { ...testCapProvider, name: "Shodan" },
      credentials: [{ name: "SHODAN_API_KEY" }],
    }),
    buildCapListItem(),
    buildCapListItem({
      id: "identity.gravatar.lookup",
      title: "Gravatar lookup",
      consumes: [{ kind: "identifier", type: "email" }],
    }),
    buildCapListItem({
      id: "breach.hibp.lookup",
      title: "HIBP lookup",
      consumes: [{ kind: "identifier", type: "email" }],
      disabledReason: "breach_disabled",
    }),
  ],
  playbooks: [
    buildPlaybookListItem({
      id: "email-identity",
      title: "Email identity",
      seedKinds: ["email"],
      steps: ["identity.gravatar.lookup"],
    }),
  ],
  configured: new Set<string>(),
});

function renderLibrary(
  props: Partial<React.ComponentProps<typeof LibrarySplit>> = {}
) {
  const handlers = {
    onSelectedKeyChange: vi.fn(),
    onInputKindChange: vi.fn(),
  };
  render(
    <LibrarySplit
      entries={entries}
      isPending={false}
      isPlaceholder={false}
      loadError={null}
      onRetry={vi.fn()}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

function rowTitles(): string[] {
  return screen
    .getAllByRole("option")
    .map(
      (row) =>
        within(row).getAllByText(/lookup|identity/i)[0]?.textContent ?? ""
    );
}

describe("Library queue", () => {
  it("groups entries by category, Playbooks first, and lists ready entries first", () => {
    renderLibrary();

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    ).toEqual([
      expect.stringContaining("Playbooks"),
      expect.stringContaining("Breach"),
      expect.stringContaining("Identity"),
      expect.stringContaining("Network"),
    ]);
    // Network: the ready DNS lookup before the keyed Shodan lookup.
    expect(rowTitles().slice(-2)).toEqual(["DNS lookup", "Shodan lookup"]);
  });

  it("shows each entry's readiness and a separate third-party mark", () => {
    renderLibrary();

    const shodan = screen.getByRole("option", { name: /Shodan lookup/ });
    expect(within(shodan).getByText("Needs a key")).toBeInTheDocument();
    expect(within(shodan).getByText("Third party")).toBeInTheDocument();

    const dns = screen.getByRole("option", { name: /DNS lookup/ });
    expect(within(dns).getByText("Ready")).toBeInTheDocument();
    expect(within(dns).queryByText("Third party")).not.toBeInTheDocument();

    const hibp = screen.getByRole("option", { name: /HIBP lookup/ });
    expect(within(hibp).getByText("Off by the operator")).toBeInTheDocument();
  });

  it("shows only what takes the chosen input kind", () => {
    renderLibrary({ inputKind: "email" });

    // Still grouped: the Playbook, then Breach, then Identity.
    expect(rowTitles()).toEqual([
      "Email identity",
      "HIBP lookup",
      "Gravatar lookup",
    ]);
  });

  it("offers the input kinds with counts and reports the pick", async () => {
    const user = userEvent.setup();
    const handlers = renderLibrary();

    await user.click(
      screen.getByRole("combobox", { name: "Start from what you have" })
    );
    await user.click(
      await screen.findByRole("option", { name: "Email address (3)" })
    );

    expect(handlers.onInputKindChange).toHaveBeenCalledWith("email");
  });

  it("searches title, provider and id", async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.type(
      screen.getByRole("textbox", { name: "Search the Library" }),
      "shodan"
    );

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(
      screen.getByRole("option", { name: /Shodan lookup/ })
    ).toBeInTheDocument();
  });

  it("filters by readiness from the filter menu", async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(
      await screen.findByRole("checkbox", { name: "Off by the operator" })
    );

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(
      screen.getByRole("option", { name: /HIBP lookup/ })
    ).toBeInTheDocument();
  });

  it("filters to entries that send data to a third party", async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(
      await screen.findByRole("checkbox", {
        name: "Sends data to a third party",
      })
    );

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(
      screen.getByRole("option", { name: /Shodan lookup/ })
    ).toBeInTheDocument();
  });

  it("offers to clear filters when nothing matches", async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.type(
      screen.getByRole("textbox", { name: "Search the Library" }),
      "zzzz"
    );

    expect(screen.getByText(/No Entries Match/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("option").length).toBeGreaterThan(1);
  });

  it("reports a load error with Retry instead of an empty list", () => {
    renderLibrary({ entries: [], loadError: "Couldn't load the Library" });

    expect(screen.getByText("Couldn't load the Library")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("selecting a row reports its key", async () => {
    const user = userEvent.setup();
    const handlers = renderLibrary();

    await user.click(screen.getByRole("option", { name: /DNS lookup/ }));

    expect(handlers.onSelectedKeyChange).toHaveBeenCalledWith(
      "cap:network.dns.lookup"
    );
  });
});

describe("Library detail", () => {
  it("explains the Library until an entry is selected", () => {
    renderLibrary();

    expect(screen.getByText("The Library")).toBeInTheDocument();
    expect(
      screen.getByText(/Every Cap and Playbook this server can run/)
    ).toBeInTheDocument();
  });

  it("shows a minimal header for the selected entry, with a link to the vault slot", () => {
    renderLibrary({ selectedKey: "cap:network.shodan.lookup" });

    expect(screen.queryByText("The Library")).not.toBeInTheDocument();
    expect(screen.getAllByText("Shodan lookup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Network").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shodan").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Connect it in Settings" })
    ).toHaveAttribute("href", "/settings");
  });

  it("says an operator turned the entry off", () => {
    renderLibrary({ selectedKey: "cap:breach.hibp.lookup" });

    expect(
      screen.getByText(/An operator has turned breach Caps off/)
    ).toBeInTheDocument();
  });

  it("falls back to the explainer for an unknown key", () => {
    renderLibrary({ selectedKey: "cap:nope" });

    expect(screen.getByText("The Library")).toBeInTheDocument();
  });
});
