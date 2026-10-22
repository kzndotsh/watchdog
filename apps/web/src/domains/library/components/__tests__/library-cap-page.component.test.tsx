import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { casesContextQuery } from "@/domains/cases/queries";
import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import { LibraryCapPage } from "@/domains/library/components/library-cap-page";
import { credentialsListQuery } from "@/domains/settings/queries";
import {
  buildCapListItem,
  buildCaseRecord,
  buildPlaybookListItem,
  testCapProvider,
} from "@/testing/records";
import type { CredentialSlot } from "@watchdog/core/vault";
import { testCaseId } from "@watchdog/schemas/testing";
import { SidebarProvider } from "@watchdog/ui/components/sidebar";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@/domains/jobs/jobs.functions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domains/jobs/jobs.functions")>()),
  listPlaybooksFn: vi.fn(() => Promise.reject(new Error("boom"))),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/library/caps/x" }, matches: [] }),
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children?: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string | undefined>;
  }) => {
    let path = to;
    for (const [key, value] of Object.entries(params ?? {})) {
      path = path.replace(`$${key}`, value);
    }
    const query = new URLSearchParams(
      Object.entries(search ?? {}).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, value]]
      )
    ).toString();
    return <a href={query === "" ? path : `${path}?${query}`}>{children}</a>;
  },
}));

const alpha = buildCaseRecord();
const beta = buildCaseRecord({
  id: testCaseId(11),
  name: "Beta",
  slug: "beta",
});

const caps = [
  buildCapListItem({
    id: "network.shodan.lookup",
    title: "Shodan lookup",
    egress: "third_party",
    provider: { ...testCapProvider, name: "Shodan" },
    credentials: [{ name: "SHODAN_API_KEY" }],
    consumes: [{ kind: "identifier", type: "ip" }],
    timeoutMs: 45_000,
  }),
  buildCapListItem({
    id: "identity.gravatar.lookup",
    title: "Gravatar lookup",
    consumes: [{ kind: "identifier", type: "email" }],
  }),
];
const playbooks = [
  buildPlaybookListItem({
    id: "email-identity",
    title: "Email identity",
    seedKinds: ["email"],
    steps: ["identity.gravatar.lookup"],
  }),
];

function renderPage(
  capId: string,
  configured: string[] = [],
  { isPlaybooksFailing = false }: { isPlaybooksFailing?: boolean } = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(capabilitiesListQuery().queryKey, caps);
  if (!isPlaybooksFailing) {
    client.setQueryData(playbooksListQuery().queryKey, playbooks);
  }
  client.setQueryData(
    credentialsListQuery().queryKey,
    configured.map((name): CredentialSlot => ({
      name,
      label: name,
      description: "",
      configured: true,
      updatedAt: "2026-01-01T12:00:00.000Z",
      breachDisabled: false,
    }))
  );
  client.setQueryData(casesContextQuery().queryKey, {
    cases: [alpha, beta],
    active: null,
  });
  render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <LibraryCapPage capId={capId} />
      </SidebarProvider>
    </QueryClientProvider>
  );
}

describe("Library Cap page", () => {
  it("shows the header (title, egress, back link) and the readiness note", () => {
    renderPage("network.shodan.lookup");

    expect(
      screen.getByRole("heading", { name: "Shodan lookup" })
    ).toBeInTheDocument();
    expect(screen.getByText("Third party")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Library" })).toHaveAttribute(
      "href",
      "/library"
    );
    expect(screen.getByText(/Missing the API key/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Connect it in Settings" })
    ).toHaveAttribute("href", "/settings?tab=credentials");
  });

  it("summarises the Cap in the facts strip", () => {
    renderPage("network.shodan.lookup");

    const facts = within(screen.getByText("Takes").closest("dl")!);
    expect(facts.getByText("IP address")).toBeInTheDocument();
    expect(facts.getByText("Sent out")).toBeInTheDocument();
    expect(facts.getByText("45 s")).toBeInTheDocument();
  });

  it("states behaviour, privacy and keys from the descriptor", () => {
    renderPage("network.shodan.lookup");

    expect(screen.getAllByText("45 s").length).toBeGreaterThan(1);
    expect(
      screen.getByText("Your input is sent to Shodan.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("SHODAN_API_KEY")).toHaveLength(2);
    expect(screen.getByText(", missing")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Keys in Settings" })
    ).toHaveAttribute("href", "/settings?tab=credentials");
    expect(screen.getByRole("link", { name: "Shodan" })).toHaveAttribute(
      "href",
      "https://example.com"
    );
  });

  it("links what it takes to the input-kind view", () => {
    renderPage("identity.gravatar.lookup");

    expect(
      screen.getAllByRole("link", { name: "Email address" })[0]
    ).toHaveAttribute("href", "/library?kind=email");
  });

  it("links the Playbooks that include it to their pages", () => {
    renderPage("identity.gravatar.lookup");

    expect(
      screen.getByRole("link", { name: "Email identity" })
    ).toHaveAttribute("href", "/library/playbooks/email-identity");
    expect(screen.getByText(/1 step/)).toBeInTheDocument();
  });

  it("opens Collect in the chosen Case with the Cap preselected", async () => {
    const user = userEvent.setup();
    navigate.mockClear();
    renderPage("identity.gravatar.lookup");

    await user.click(screen.getByRole("combobox", { name: "Case to run on" }));
    await user.click(await screen.findByRole("option", { name: "Beta" }));
    await user.click(screen.getByRole("button", { name: "Run on…" }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/cases/$caseSlug/collect",
      params: { caseSlug: "beta" },
      search: { run: "cap:identity.gravatar.lookup" },
    });
  });

  it("turns Run on… off, with the reason, until the Cap is ready", () => {
    renderPage("network.shodan.lookup");

    expect(screen.getByRole("button", { name: "Run on…" })).toBeDisabled();
    expect(
      screen.getByText("Add SHODAN_API_KEY in Settings first.")
    ).toBeInTheDocument();
  });

  it("enables Run on… once the key is connected", () => {
    renderPage("network.shodan.lookup", ["SHODAN_API_KEY"]);

    expect(screen.getByRole("button", { name: "Run on…" })).toBeEnabled();
  });

  it("shows not found for an unknown Cap id", () => {
    renderPage("nope.nope");

    expect(screen.getByText("Cap not found")).toBeInTheDocument();
  });

  it("reports a failed Playbook read with Retry instead of claiming no Playbook runs it", async () => {
    renderPage("identity.gravatar.lookup", [], { isPlaybooksFailing: true });

    expect(
      await screen.findByRole("button", { name: /retry/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Playbooks did not load.")).toBeInTheDocument();
    expect(screen.queryByText("No Playbook runs it.")).not.toBeInTheDocument();
  });
});
