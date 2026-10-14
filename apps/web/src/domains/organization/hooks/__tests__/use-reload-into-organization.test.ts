import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const reload = vi.hoisted(() => vi.fn());
vi.mock("@/domains/organization/lib/switch-organization", () => ({
  reloadIntoOrganization: reload,
}));

import { authQueryKeys } from "@better-auth-ui/core";

import { useReloadIntoOrganization } from "@/domains/organization/hooks/use-reload-into-organization";
import { organizationKeys } from "@/domains/organization/queries";

afterEach(() => {
  reload.mockClear();
});

describe("useReloadIntoOrganization", () => {
  it("marks the organization state and the session stale, then reloads", () => {
    const client = new QueryClient();
    client.setQueryData(organizationKeys.state("u1"), { organizationId: null });
    client.setQueryData(organizationKeys.state("u2"), { organizationId: "o" });
    client.setQueryData(authQueryKeys.session, { user: { id: "u1" } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(() => useReloadIntoOrganization(), {
      wrapper,
    });
    result.current();

    expect(reload).toHaveBeenCalledOnce();
    for (const key of [
      organizationKeys.state("u1"),
      organizationKeys.state("u2"),
      authQueryKeys.session,
    ]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
