import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const getOrganizationState = vi.hoisted(() => vi.fn());

vi.mock("@/domains/organization/organization.functions", () => ({
  getOrganizationStateFn: getOrganizationState,
}));
vi.mock("@/auth/client", () => ({ authClient: {} }));

import { ensureOrganizationState } from "@/auth/ensure-organization";
import { organizationKeys } from "@/domains/organization/queries";

const session = {
  user: { id: "u1" },
  session: { activeOrganizationId: "org-session" },
};

afterEach(() => {
  getOrganizationState.mockReset();
});

describe("ensureOrganizationState", () => {
  it("client: the session's active organization answers a first lookup without a request", async () => {
    vi.stubGlobal("window", {});
    const client = new QueryClient();

    await expect(ensureOrganizationState(client, session)).resolves.toEqual({
      organizationId: "org-session",
    });
    expect(getOrganizationState).not.toHaveBeenCalled();
    expect(client.getQueryData(organizationKeys.state("u1"))).toEqual({
      organizationId: "org-session",
    });
  });

  it("client: asks the server when the session names no organization", async () => {
    vi.stubGlobal("window", {});
    getOrganizationState.mockResolvedValue({ organizationId: "org-db" });

    await expect(
      ensureOrganizationState(new QueryClient(), {
        user: { id: "u1" },
        session: { activeOrganizationId: null },
      })
    ).resolves.toEqual({ organizationId: "org-db" });
    expect(getOrganizationState).toHaveBeenCalledOnce();
  });

  it("client: an invalidated answer is asked again, never re-seeded from the session", async () => {
    vi.stubGlobal("window", {});
    getOrganizationState.mockResolvedValue({ organizationId: "org-db" });
    const client = new QueryClient();
    await ensureOrganizationState(client, session);
    await client.invalidateQueries({
      queryKey: organizationKeys.stateAll(),
      refetchType: "none",
    });

    await expect(ensureOrganizationState(client, session)).resolves.toEqual({
      organizationId: "org-db",
    });
    expect(getOrganizationState).toHaveBeenCalledOnce();
  });

  it("client: a failed answer is asked again rather than hidden by the session's name", async () => {
    vi.stubGlobal("window", {});
    getOrganizationState.mockRejectedValueOnce(new Error("boom"));
    getOrganizationState.mockResolvedValue({ organizationId: null });
    const client = new QueryClient();
    // A first lookup that went to the server and failed (no seed: nothing named an organization).
    await expect(
      ensureOrganizationState(client, {
        user: { id: "u1" },
        session: { activeOrganizationId: null },
      })
    ).rejects.toThrow("boom");

    await expect(ensureOrganizationState(client, session)).resolves.toEqual({
      organizationId: null,
    });
    expect(getOrganizationState).toHaveBeenCalledTimes(2);
  });

  it("server: always asks the database, whatever the session names", async () => {
    vi.stubGlobal("window", undefined);
    getOrganizationState.mockResolvedValue({ organizationId: null });

    await expect(
      ensureOrganizationState(new QueryClient(), session)
    ).resolves.toEqual({ organizationId: null });
    expect(getOrganizationState).toHaveBeenCalledOnce();
  });

  it("keeps one user's answer away from another user", async () => {
    vi.stubGlobal("window", {});
    const client = new QueryClient();
    await ensureOrganizationState(client, session);

    getOrganizationState.mockResolvedValue({ organizationId: null });
    await expect(
      ensureOrganizationState(client, {
        user: { id: "u2" },
        session: { activeOrganizationId: null },
      })
    ).resolves.toEqual({ organizationId: null });
  });
});
