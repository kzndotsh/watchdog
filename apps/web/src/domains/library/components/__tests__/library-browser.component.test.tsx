import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  LibraryBrowser,
  type LibraryBrowserProps,
} from "@/domains/library/components/library-browser";
import { buildLibraryEntries } from "@/domains/library/lib/library-entries";
import type {
  LibrarySearch,
  LibrarySearchPatch,
} from "@/domains/library/lib/library-search";
import {
  buildCapListItem,
  buildPlaybookListItem,
  testCapProvider,
} from "@/testing/records";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
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
    search?: Record<string, string>;
    className?: string;
  }) => {
    const path = to.replaceAll(
      /\$(\w+)/g,
      (_, key: string) => params?.[key] ?? ""
    );
    const query = new URLSearchParams(search).toString();
    return (
      <a href={query === "" ? path : `${path}?${query}`} className={className}>
        {children}
      </a>
    );
  },
}));

const shodan = buildCapListItem({
  id: "network.shodan.lookup",
  title: "Shodan lookup",
  description: "Open ports and banners",
  egress: ["account_lookup"],
  contacts: [{ kind: "provider", host: "api.vendor.test", access: "keyed" }],
  provider: { ...testCapProvider, name: "Shodan" },
  credentials: [{ name: "SHODAN_API_KEY" }],
});
const playbook = buildPlaybookListItem({
  id: "email-identity",
  title: "Email identity",
  seedKinds: ["email"],
  steps: ["identity.gravatar.lookup"],
});
const caps = [
  shodan,
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
];
const entries = buildLibraryEntries({
  caps,
  playbooks: [playbook],
  configured: new Set<string>(),
});
const readyOnly = buildLibraryEntries({
  caps: caps.filter((cap) => cap.id !== shodan.id),
  playbooks: [playbook],
  configured: new Set<string>(),
});

/** Applies each patch like the route does, so the rail and filters combine as in the app. */
const NO_SEARCH: LibrarySearch = {};

function Harness({
  initial = NO_SEARCH,
  ...props
}: Partial<LibraryBrowserProps> & { initial?: LibrarySearch }) {
  const [search, setSearch] = useState<LibrarySearch>(initial);
  const handleChange = (patch: LibrarySearchPatch) => {
    setSearch((prev) => ({ ...prev, ...patch }));
  };
  return (
    <LibraryBrowser
      entries={entries}
      isPending={false}
      isPlaceholder={false}
      loadError={null}
      keysError={null}
      onRetry={vi.fn()}
      {...props}
      search={search}
      onSearchChange={handleChange}
    />
  );
}

function cardTitles(options?: { hidden?: boolean }): string[] {
  return screen
    .getAllByRole("link", { name: /lookup|identity/i, ...options })
    .filter((link) => link.getAttribute("href")?.startsWith("/library/"))
    .map((link) => link.querySelector("p")?.textContent ?? "");
}

beforeAll(preloadSharedLazyChunks);

describe("Library card grid", () => {
  it("shows a skeleton rail and grid while loading, never an empty rail", () => {
    render(<Harness entries={[]} isPending />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading the Library");
    expect(
      screen.queryByRole("navigation", { name: "Library categories" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /All/ })
    ).not.toBeInTheDocument();
  });

  it("shows a section per category under All, Playbooks first, ready entries first", () => {
    render(<Harness />);

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    ).toEqual([
      expect.stringContaining("Playbooks"),
      expect.stringContaining("Breach"),
      expect.stringContaining("Identity"),
      expect.stringContaining("Network"),
    ]);
    expect(cardTitles().slice(-2)).toEqual(["DNS lookup", "Shodan lookup"]);
  });

  it("shows kind, the third-party mark, and readiness only when an entry is not ready", () => {
    render(<Harness />);

    const shodanCard = screen.getByRole("link", { name: /Shodan lookup/ });
    expect(within(shodanCard).getByText("Missing API key")).toBeInTheDocument();
    expect(within(shodanCard).getByText("Third party")).toBeInTheDocument();
    expect(within(shodanCard).getByText("Cap")).toBeInTheDocument();
    expect(
      within(shodanCard).getByRole("img", { name: /^Takes / })
    ).toBeInTheDocument();

    const dns = screen.getByRole("link", { name: /DNS lookup/ });
    expect(within(dns).queryByText("Ready")).not.toBeInTheDocument();
    expect(within(dns).queryByText("Third party")).not.toBeInTheDocument();

    const hibp = screen.getByRole("link", { name: /HIBP lookup/ });
    expect(within(hibp).getByText("Off by the operator")).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /Email identity/ })).getByText(
        "Playbook"
      )
    ).toBeInTheDocument();
  });

  it("links a Cap card to its page and a Playbook card to its page", () => {
    render(<Harness />);

    expect(screen.getByRole("link", { name: /Shodan lookup/ })).toHaveAttribute(
      "href",
      "/library/caps/network.shodan.lookup"
    );
    expect(
      screen.getByRole("link", { name: /Email identity/ })
    ).toHaveAttribute("href", "/library/playbooks/email-identity");
  });
});

describe("Library category rail", () => {
  it("lists All, Playbooks, then each Cap category with counts", () => {
    render(<Harness />);

    const rail = within(
      screen.getByRole("navigation", { name: "Library categories" })
    );
    expect(
      rail.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["All5", "Playbooks1", "Breach1", "Identity1", "Network2"]);
  });

  it("titles a single category like a section under All, so the grid does not shift", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /^Network/ }));

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    ).toEqual(["Network·2"]);
    expect(cardTitles()).toEqual(["DNS lookup", "Shodan lookup"]);
    expect(screen.getByRole("button", { name: /^Network/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("combines with the filters and keeps counts in step with them", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ kind: ["email"] }} />);

    // Under "start from an email address": the Playbook, HIBP and Gravatar.
    expect(
      within(
        screen.getByRole("navigation", { name: "Library categories" })
      ).getByRole("button", { name: /^Network/ })
    ).toHaveTextContent("0");

    await user.click(screen.getByRole("button", { name: /^Identity/ }));
    expect(cardTitles()).toEqual(["Gravatar lookup"]);

    await user.click(screen.getByRole("button", { name: /^Network/ }));
    expect(screen.getByText(/No Entries Match/)).toBeInTheDocument();
  });

  it("treats an unknown category in the URL as All", () => {
    render(<Harness initial={{ cat: "nope" }} />);

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
  });
});

describe("Library filters", () => {
  it("searches title, provider and id", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search entries" }),
      "shodan"
    );

    await waitFor(() => {
      expect(cardTitles()).toEqual(["Shodan lookup"]);
    });
  });

  it("filters by readiness from the Filters popover, with a chip", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    // Takes is the first declared filter, Readiness the second.
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    await user.click(
      screen.getByRole("combobox", { name: "Readiness values" })
    );
    await user.click(
      await screen.findByRole("option", { name: "Off by the operator" })
    );

    expect(cardTitles()).toEqual(["HIBP lookup"]);
    expect(
      screen.getByRole("group", { name: "Active filters" })
    ).toHaveTextContent("Readiness: Off by the operator");
  });

  it("filters to entries that send data to a third party", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    const addFilter = async () => {
      await user.click(
        await screen.findByRole("button", { name: "Add filter" })
      );
    };
    await addFilter();
    await addFilter();
    await addFilter();
    await user.click(
      screen.getByRole("switch", { name: "Sends data to a third party only" })
    );

    expect(cardTitles()).toEqual(["Shodan lookup"]);
  });

  it("picks the input kinds it takes from the Filters popover, counted", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Takes values" }));
    await user.click(
      await screen.findByRole("option", { name: "Email address (3)" })
    );
    // The page behind the open popover is hidden from the accessibility tree.
    expect(cardTitles({ hidden: true })).toEqual([
      "Email identity",
      "HIBP lookup",
      "Gravatar lookup",
    ]);
  });

  it("makes cards compact from Display options", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText("Open ports and banners")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Display options" }));
    await user.click(
      await screen.findByRole("switch", { name: "Compact rows" })
    );

    expect(
      screen.queryByText("Open ports and banners")
    ).not.toBeInTheDocument();
    expect(cardTitles()).toHaveLength(5);
  });

  it("starts from the chosen input kind", () => {
    render(<Harness initial={{ kind: ["email"] }} />);

    expect(cardTitles()).toEqual([
      "Email identity",
      "HIBP lookup",
      "Gravatar lookup",
    ]);
  });

  it("offers a clear-filters action when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ cat: "network" }} />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search entries" }),
      "zzzz"
    );

    expect(await screen.findByText(/No Entries Match/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(cardTitles().length).toBeGreaterThan(2);
    expect(
      screen.getByRole("searchbox", { name: "Search entries" })
    ).toHaveValue("");
  });
});

describe("Library banners", () => {
  it("offers quick picks for the common input kinds and sets the kind", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const banner = within(
      screen.getByRole("region", { name: "Start from what you have" })
    );
    // Email is taken by three entries and the rest by one: it leads.
    expect(banner.getAllByRole("button")[0]).toHaveTextContent("Email address");

    await user.click(banner.getByRole("button", { name: "Email address" }));
    expect(
      banner.getByRole("button", { name: "Email address" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(cardTitles()).toHaveLength(3);

    await user.click(banner.getByRole("button", { name: "Email address" }));
    expect(cardTitles()).toHaveLength(5);
  });

  it("counts the entries that need a key and links to the credentials", () => {
    render(<Harness />);

    const banner = within(screen.getByRole("region", { name: "Add API keys" }));
    expect(
      banner.getByText("Add API keys to unlock 1 Cap or Playbook")
    ).toBeInTheDocument();
    expect(banner.getByRole("link", { name: "Add API keys" })).toHaveAttribute(
      "href",
      "/settings?tab=credentials"
    );
  });

  it("hides the keys banner when nothing needs a key", () => {
    render(<Harness entries={readyOnly} />);

    expect(
      screen.queryByRole("region", { name: "Add API keys" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Start from what you have" })
    ).toBeInTheDocument();
  });
});

describe("Library states", () => {
  it("reports a load error with Retry instead of an empty grid", () => {
    render(<Harness entries={[]} loadError="Couldn't load the Library" />);

    expect(screen.getByText("Couldn't load the Library")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps the grid and offers a retry when your keys could not be checked", async () => {
    const onRetry = vi.fn();
    render(<Harness keysError="Couldn't check your keys" onRetry={onRetry} />);

    expect(screen.getByText("Gravatar lookup")).toBeInTheDocument();
    expect(screen.getByText("Couldn't check your keys")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says so when the server has no entries", () => {
    render(<Harness entries={[]} />);

    expect(
      screen.getByText("This server has no Caps or Playbooks registered.")
    ).toBeInTheDocument();
  });

  it("shows a loading state while the catalog loads", () => {
    render(<Harness entries={[]} isPending />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
