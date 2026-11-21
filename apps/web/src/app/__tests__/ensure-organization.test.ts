import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
vi.mock("@/auth/client", () => ({ authClient: {} }));

import { ensureOrganizationState } from "@/app/ensure-organization";
import { organizationKeys } from "@/domains/organization/queries";
import { procedureDouble, sessionInOrganization } from "@/testing/orpc-client";

const whoami = procedureDouble("auth.whoami");

const session = {
  user: { id: "u1" },
  session: { activeOrganizationId: "org-session" },
};

afterEach(() => {
  whoami.mockReset();
});

describe("ensureOrganizationState", () => {
  it("client: the session's active organization answers a first lookup without a request", async () => {
    vi.stubGlobal("window", {});
    const client = new QueryClient();

    await expect(ensureOrganizationState(client, session)).resolves.toEqual({
      organizationId: "org-session",
    });
    expect(whoami).not.toHaveBeenCalled();
    expect(client.getQueryData(organizationKeys.state("u1"))).toEqual({
      organizationId: "org-session",
    });
  });

  it("client: asks the server when the session names no organization", async () => {
    vi.stubGlobal("window", {});
    whoami.mockImplementation(sessionInOrganization("org-db"));

    await expect(
      ensureOrganizationState(new QueryClient(), {
        user: { id: "u1" },
        session: { activeOrganizationId: null },
      })
    ).resolves.toEqual({ organizationId: "org-db" });
    expect(whoami).toHaveBeenCalledOnce();
  });

  it("client: an invalidated answer is asked again, never re-seeded from the session", async () => {
    vi.stubGlobal("window", {});
    whoami.mockImplementation(sessionInOrganization("org-db"));
    const client = new QueryClient();
    await ensureOrganizationState(client, session);
    await client.invalidateQueries({
      queryKey: organizationKeys.stateAll(),
      refetchType: "none",
    });

    await expect(ensureOrganizationState(client, session)).resolves.toEqual({
      organizationId: "org-db",
    });
    expect(whoami).toHaveBeenCalledOnce();
  });

  it("client: a failed answer is asked again rather than hidden by the session's name", async () => {
    vi.stubGlobal("window", {});
    whoami.mockRejectedValueOnce(new Error("boom"));
    whoami.mockImplementation(sessionInOrganization(null));
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
    expect(whoami).toHaveBeenCalledTimes(2);
  });

  it("server: always asks the database, whatever the session names", async () => {
    vi.stubGlobal("window", undefined);
    whoami.mockImplementation(sessionInOrganization(null));

    await expect(
      ensureOrganizationState(new QueryClient(), session)
    ).resolves.toEqual({ organizationId: null });
    expect(whoami).toHaveBeenCalledOnce();
  });

  it("keeps one user's answer away from another user", async () => {
    vi.stubGlobal("window", {});
    const client = new QueryClient();
    await ensureOrganizationState(client, session);

    whoami.mockImplementation(sessionInOrganization(null));
    await expect(
      ensureOrganizationState(client, {
        user: { id: "u2" },
        session: { activeOrganizationId: null },
      })
    ).resolves.toEqual({ organizationId: null });
  });
});
