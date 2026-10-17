import { describe, expect, it, vi } from "vitest";

import { callRouteHook } from "@/testing/route-hooks";
import { testId } from "@watchdog/test-kit";

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

import { Route as collect } from "@/routes/_protected/collect/index";
import { Route as dossier } from "@/routes/_protected/entities/$entitySlug";
import { Route as entities } from "@/routes/_protected/entities/index";
import { Route as graph } from "@/routes/_protected/graph/index";
import { Route as identifiers } from "@/routes/_protected/identifiers/index";
import { Route as tasks } from "@/routes/_protected/tasks/index";
import { Route as triage } from "@/routes/_protected/triage/index";

const ACTIVE = { id: testId(10), slug: "alpha", name: "Alpha" };

/** The Active Case cookie, as the cases-context query the protected layout warmed. */
function clientWithActive(active: typeof ACTIVE | null) {
  return { query: vi.fn().mockResolvedValue({ active, cases: [] }) };
}

describe("Case-less Work URLs redirect to the slugged URL", () => {
  it.each([
    ["collect", collect, "/cases/$caseSlug/collect"],
    ["triage", triage, "/cases/$caseSlug/triage"],
    ["tasks", tasks, "/cases/$caseSlug/tasks"],
    ["graph", graph, "/cases/$caseSlug/graph"],
    ["identifiers", identifiers, "/cases/$caseSlug/identifiers"],
    ["entities", entities, "/cases/$caseSlug/entities"],
  ] as const)(
    "/%s goes to the Active Case's screen, keeping the search",
    async (_name, route, to) => {
      await expect(
        callRouteHook(route.options.beforeLoad, {
          context: { queryClient: clientWithActive(ACTIVE) },
        })
      ).rejects.toEqual({
        to,
        params: { caseSlug: "alpha" },
        search: true,
        replace: true,
      });
    }
  );

  it("/entities/$entitySlug goes to the Dossier in the Active Case", async () => {
    await expect(
      callRouteHook(dossier.options.beforeLoad, {
        context: { queryClient: clientWithActive(ACTIVE) },
        params: { entitySlug: "ada" },
      })
    ).rejects.toEqual({
      to: "/cases/$caseSlug/entities/$entitySlug",
      params: { caseSlug: "alpha", entitySlug: "ada" },
      search: true,
      replace: true,
    });
  });

  it("with no Active Case there is no Case to open, so it lands on the Cases list", async () => {
    await expect(
      callRouteHook(collect.options.beforeLoad, {
        context: { queryClient: clientWithActive(null) },
      })
    ).rejects.toEqual({ to: "/cases", replace: true });
  });
});
