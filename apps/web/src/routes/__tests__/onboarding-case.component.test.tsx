import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    useNavigate: () => navigate,
    Link: ({ to, children }: { to: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
    redirect: (options: unknown) => {
      throw options;
    },
  };
});

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

const getSession = vi.hoisted(() => vi.fn());
const getOrganizationState = vi.hoisted(() => vi.fn());

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

const fns = vi.hoisted(() => ({
  createCaseFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
  getCasesContextFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  createCaseFn: fns.createCaseFn,
  getDeletionPolicyFn: fns.getDeletionPolicyFn,
  getCasesContextFn: fns.getCasesContextFn,
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
  listDeletedCasesFn: vi.fn(),
}));

import { casesKeys } from "@/domains/cases/queries";
import type { CasesContext } from "@/domains/cases/types";
import { Route } from "@/routes/onboarding_.case";
import { createAppQueryClient } from "@/shared/lib/query-client";
import { buildCaseRecord } from "@/testing/records";
import { callRouteHook } from "@/testing/route-hooks";

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderStep() {
  const Page = Route.options.component!;
  const client = newClient();
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>
  );
  return client;
}

describe("/onboarding/case", () => {
  beforeEach(() => {
    navigate.mockReset();
    fns.createCaseFn.mockReset();
    fns.getDeletionPolicyFn.mockReset().mockResolvedValue({ canManage: false });
    fns.getCasesContextFn
      .mockReset()
      .mockResolvedValue({ cases: [], active: null });
  });

  describe("beforeLoad", () => {
    const session = {
      user: { id: "u", name: "Analyst" },
      session: { id: "s", activeOrganizationId: "org-1" },
    };

    async function run() {
      return callRouteHook(Route.options.beforeLoad, {
        context: { queryClient: createAppQueryClient() },
        location: { href: "/onboarding/case" },
      });
    }

    beforeEach(() => {
      getSession.mockReset().mockResolvedValue(session);
      getOrganizationState
        .mockReset()
        .mockResolvedValue({ organizationId: "org-1" });
    });

    it("lets a user with no Case in", async () => {
      await expect(run()).resolves.toBeUndefined();
    });

    it("sends a user who already has a Case to the app", async () => {
      const row = buildCaseRecord();
      fns.getCasesContextFn.mockResolvedValue({ cases: [row], active: row });
      await expect(run()).rejects.toEqual(expect.objectContaining({ to: "/" }));
    });

    it("sends a user with no organization back to the organization step", async () => {
      getSession.mockResolvedValue({
        ...session,
        session: { id: "s", activeOrganizationId: null },
      });
      getOrganizationState.mockResolvedValue({ organizationId: null });
      await expect(run()).rejects.toEqual(
        expect.objectContaining({ to: "/onboarding" })
      );
    });

    it("sends a signed-out visitor to sign-in", async () => {
      getSession.mockResolvedValue(null);
      await expect(run()).rejects.toEqual(
        expect.objectContaining({ to: "/auth/$path" })
      );
    });
  });

  describe("page", () => {
    it("creates the Case, makes it the Active Case in the cache and opens its overview", async () => {
      const created = buildCaseRecord({ name: "First", slug: "first" });
      fns.createCaseFn.mockResolvedValue(created);
      const user = userEvent.setup();
      const client = renderStep();

      expect(screen.getByText("Create your first Case")).toBeInTheDocument();
      await user.type(screen.getByLabelText("Case name"), "First");
      await user.click(screen.getByRole("button", { name: "Create Case" }));

      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith({
          to: "/cases/$caseSlug",
          params: { caseSlug: "first" },
        });
      });
      expect(fns.createCaseFn).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: "First", slug: "first" }),
      });
      expect(
        client.getQueryData<CasesContext>(casesKeys.context())
      ).toMatchObject({ cases: [created], active: created });
    });

    it("stays on the step when the create fails", async () => {
      fns.createCaseFn.mockRejectedValue(new Error("Slug taken"));
      const user = userEvent.setup();
      renderStep();

      await user.type(screen.getByLabelText("Case name"), "First");
      await user.click(screen.getByRole("button", { name: "Create Case" }));

      await waitFor(() => {
        expect(fns.createCaseFn).toHaveBeenCalled();
      });
      expect(navigate).not.toHaveBeenCalled();
    });

    it("always offers Settings", () => {
      renderStep();
      expect(screen.getByText("Open Settings")).toBeInTheDocument();
    });

    it("offers the restore path to owners and admins", async () => {
      fns.getDeletionPolicyFn.mockResolvedValue({ canManage: true });
      renderStep();
      expect(
        await screen.findByText("Restore a deleted Case")
      ).toBeInTheDocument();
    });

    it("hides the restore path from a member", async () => {
      renderStep();
      await waitFor(() => {
        expect(fns.getDeletionPolicyFn).toHaveBeenCalled();
      });
      expect(screen.queryByText("Restore a deleted Case")).toBeNull();
    });
  });
});
