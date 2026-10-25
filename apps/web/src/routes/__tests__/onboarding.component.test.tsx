import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    redirect: (options: unknown) => {
      throw options;
    },
  };
});

const getSession = vi.hoisted(() => vi.fn());
const getOrganizationState = vi.hoisted(() => vi.fn());
const getCasesContext = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    // The client branch only: this runs in jsdom, where the browser build would be used.
    createIsomorphicFn: () => ({
      server: () => ({
        client: (clientHandler: () => unknown) => clientHandler,
      }),
    }),
  };
});
vi.mock("@/auth/client", () => ({ authClient: { getSession } }));
vi.mock("@/domains/organization/organization.functions", () => ({
  getOrganizationStateFn: getOrganizationState,
}));
vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: getCasesContext,
}));

import { Route } from "@/routes/onboarding";
import { createAppQueryClient } from "@/shared/lib/query-client";
import { buildCaseRecord } from "@/testing/records";
import { callRouteHook } from "@/testing/route-hooks";

const session = {
  user: { id: "u", name: "Analyst" },
  session: { id: "s", activeOrganizationId: "org-1" },
};

async function run() {
  return callRouteHook(Route.options.beforeLoad, {
    context: { queryClient: createAppQueryClient() },
    location: { href: "/onboarding" },
  });
}

function reset(organizationId: string | null) {
  getSession.mockReset().mockResolvedValue(session);
  getOrganizationState.mockReset().mockResolvedValue({ organizationId });
  getCasesContext.mockReset().mockResolvedValue({ cases: [], active: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ allowSignup: true }))
  );
}

describe("/onboarding guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks a user with an organization and no Case for the first Case", async () => {
    reset("org-1");
    await expect(run()).resolves.toEqual({ canCreate: true, step: "case" });
  });

  it("sends a user who has a Case to the app", async () => {
    reset("org-1");
    const row = buildCaseRecord();
    getCasesContext.mockResolvedValue({ cases: [row], active: row });
    await expect(run()).rejects.toEqual(expect.objectContaining({ to: "/" }));
  });

  it("asks a user with no organization for one first", async () => {
    reset(null);
    getSession.mockResolvedValue({
      ...session,
      session: { id: "s", activeOrganizationId: null },
    });
    await expect(run()).resolves.toMatchObject({ step: "organization" });
  });

  it("sends a signed-out visitor to sign-in", async () => {
    reset("org-1");
    getSession.mockResolvedValue(null);
    await expect(run()).rejects.toEqual(
      expect.objectContaining({ to: "/auth/$path" })
    );
  });
});
