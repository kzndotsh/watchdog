import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const sessionQuery = vi.hoisted(() => vi.fn());
const getOrganizationState = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  createIsomorphicFn: () => ({
    server: (_handler: () => unknown) => ({
      client: (clientHandler: () => Promise<unknown>) => async () =>
        clientHandler(),
    }),
  }),
}));
vi.mock("@better-auth-ui/core", () => ({
  sessionOptions: () => ({ queryKey: ["session"], queryFn: sessionQuery }),
}));
vi.mock("@/domains/organization/organization.functions", () => ({
  getOrganizationStateFn: getOrganizationState,
}));
vi.mock("@/auth/client", () => ({ authClient: {} }));

import { redirectIfSignedIn, requireSession } from "@/app/require-session";

const session = {
  user: { id: "u1" },
  session: { activeOrganizationId: "org-1" },
};

afterEach(() => {
  sessionQuery.mockReset();
  getOrganizationState.mockReset();
});

async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("requireSession", () => {
  it("redirects a signed-out visit to sign-in, keeping the page asked for as redirectTo", async () => {
    sessionQuery.mockResolvedValue(null);

    const thrown = await thrownBy(async () =>
      requireSession(new QueryClient(), { href: "/cases/alpha?tab=claims" })
    );

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      options: {
        to: "/auth/$path",
        params: { path: "sign-in" },
        search: { redirectTo: "/cases/alpha?tab=claims" },
      },
    });
    expect(getOrganizationState).not.toHaveBeenCalled();
  });

  it("returns the session and its organization, and a preload is served from the cached session", async () => {
    vi.stubGlobal("window", {});
    const client = new QueryClient();
    client.setQueryData(["session"], session);

    await expect(
      requireSession(client, { href: "/" }, { isPreload: true })
    ).resolves.toEqual({ session, organizationId: "org-1" });
    expect(sessionQuery).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("answers null for a signed-in user in no organization yet", async () => {
    vi.stubGlobal("window", {});
    sessionQuery.mockResolvedValue({
      user: { id: "u1" },
      session: { activeOrganizationId: null },
    });
    getOrganizationState.mockResolvedValue({ organizationId: null });

    await expect(
      requireSession(new QueryClient(), { href: "/" })
    ).resolves.toMatchObject({ organizationId: null });
    vi.unstubAllGlobals();
  });
});

describe("redirectIfSignedIn", () => {
  it("sends a signed-in user home and lets a signed-out one through", async () => {
    sessionQuery.mockResolvedValueOnce(session);
    const thrown = await thrownBy(async () =>
      redirectIfSignedIn(new QueryClient())
    );
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: "/" } });

    sessionQuery.mockResolvedValueOnce(null);
    await expect(
      redirectIfSignedIn(new QueryClient())
    ).resolves.toBeUndefined();
  });
});
