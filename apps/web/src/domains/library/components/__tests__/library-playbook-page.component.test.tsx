import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { casesContextQuery } from "@/domains/cases/queries";
import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import { LibraryPlaybookPage } from "@/domains/library/components/library-playbook-page";
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
  listCapabilitiesFn: vi.fn(() => Promise.reject(new Error("boom"))),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/library/playbooks/x" }, matches: [] }),
  Link: ({
    children,
    to,
    search,
  }: {
    children?: React.ReactNode;
    to: string;
    search?: Record<string, string | undefined>;
  }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {}).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, value]]
      )
    ).toString();
    return <a href={query === "" ? to : `${to}?${query}`}>{children}</a>;
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
    steps: ["identity.gravatar.lookup", "network.shodan.lookup"],
    stepDependencies: [[], [0]],
  }),
];

function renderPage(
  playbookId: string,
  configured: string[] = [],
  { isCapsFailing = false }: { isCapsFailing?: boolean } = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (!isCapsFailing) {
    client.setQueryData(capabilitiesListQuery().queryKey, caps);
  }
  client.setQueryData(playbooksListQuery().queryKey, playbooks);
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
        <LibraryPlaybookPage playbookId={playbookId} />
      </SidebarProvider>
    </QueryClientProvider>
  );
}

describe("Library Playbook page", () => {
  it("frames the Playbook body with the shared header and the step graph", () => {
    renderPage("email-identity");

    expect(
      screen.getByRole("heading", { name: "Email identity" })
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 2 steps needs a key.")).toBeInTheDocument();
    expect(screen.getByText(/Reads from step 1\./)).toBeInTheDocument();
  });

  it("opens Collect in the chosen Case with the Playbook preselected", async () => {
    const user = userEvent.setup();
    navigate.mockClear();
    renderPage("email-identity", ["SHODAN_API_KEY"]);

    await user.click(screen.getByRole("combobox", { name: "Case to run on" }));
    await user.click(await screen.findByRole("option", { name: "Beta" }));
    await user.click(screen.getByRole("button", { name: "Run on…" }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/cases/$caseSlug/collect",
      params: { caseSlug: "beta" },
      search: { run: "playbook:email-identity" },
    });
  });

  it("shows not found for an unknown Playbook id", () => {
    renderPage("nope");

    expect(screen.getByText("Playbook not found")).toBeInTheDocument();
  });

  it("keeps a failed Cap read visible with Retry above the steps", async () => {
    renderPage("email-identity", [], { isCapsFailing: true });

    expect(
      await screen.findByRole("button", { name: /retry/i })
    ).toBeInTheDocument();
  });
});
