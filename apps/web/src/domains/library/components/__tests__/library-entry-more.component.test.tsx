import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import { LibraryEntryMore } from "@/domains/library/components/library-entry-more";
import { buildLibraryEntries } from "@/domains/library/lib/library-entries";
import { credentialsListQuery } from "@/domains/settings/queries";
import { buildCapListItem } from "@/testing/records";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children?: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => {
    let href = to;
    for (const [key, value] of Object.entries(params ?? {})) {
      href = href.replace(`$${key}`, value);
    }
    return <a href={href}>{children}</a>;
  },
}));

function networkCaps(count: number) {
  return Array.from({ length: count }, (_, i) =>
    buildCapListItem({ id: `network.tool${i}.lookup`, title: `Tool ${i}` })
  );
}

function renderMore(count: number) {
  const caps = networkCaps(count);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(capabilitiesListQuery().queryKey, caps);
  client.setQueryData(playbooksListQuery().queryKey, []);
  client.setQueryData(credentialsListQuery().queryKey, []);
  const entries = buildLibraryEntries({
    caps,
    playbooks: [],
    configured: new Set<string>(),
  });
  const [entry] = entries;
  if (entry === undefined) throw new Error("no entry");
  render(
    <QueryClientProvider client={client}>
      <LibraryEntryMore entry={entry} />
    </QueryClientProvider>
  );
  return entries;
}

describe("LibraryEntryMore", () => {
  it("shows at most three related cards and never the current entry", () => {
    const entries = renderMore(9);
    const [current] = entries;

    expect(
      screen.getByRole("heading", { name: "More in Network" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByText(current?.title ?? "")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows every other entry when there are fewer than three", () => {
    renderMore(3);

    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("renders nothing when the entry stands alone in its category", () => {
    renderMore(1);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
