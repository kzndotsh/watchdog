import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { activityKeys } from "@/domains/activity/queries";
import { CASES_CHANGED_EVENT } from "@/domains/cases/lib/active-case";
import { casesKeys } from "@/domains/cases/queries";
import { claimsKeys } from "@/domains/entities/claims/queries";
import { edgesKeys } from "@/domains/entities/edges/queries";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { eventsKeys } from "@/domains/entities/events/queries";
import { historyKeys } from "@/domains/entities/history/queries";
import { identifiersKeys } from "@/domains/entities/identifiers/queries";
import { questionsKeys } from "@/domains/entities/questions/queries";
import { jobsKeys } from "@/domains/jobs/queries";
import { searchKeys } from "@/domains/search/queries";
import { proposalsKeys } from "@/domains/triage/queries";
import { LIST_REFETCH_THROTTLE_MS } from "@/shared/lib/list/list-refetch-throttle";
import {
  bindCasesChangedInvalidation,
  invalidateAfterCaseSwitch,
  invalidateAfterEntityChanged,
  invalidateAfterGraphActivity,
  invalidateAfterResync,
  invalidateAfterJobMutation,
  invalidateAfterProposalAccept,
} from "@/shared/lib/query-invalidation";

/** No declared list view is cached in the mock clients: every key refetches directly. */
function noListViews() {
  return { findAll: () => [] };
}

function mockClient(): QueryClient {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    refetchQueries: vi.fn().mockResolvedValue(undefined),
    getQueryCache: noListViews,
  } as unknown as QueryClient;
}

describe("query invalidation contracts", () => {
  it("invalidateAfterCaseSwitch refreshes cases, activity, and search", async () => {
    const client = mockClient();
    await invalidateAfterCaseSwitch(client);
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: casesKeys.all,
      refetchType: "none",
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: activityKeys.all,
      refetchType: "none",
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: searchKeys.all,
      refetchType: "none",
    });
    expect(client.refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: casesKeys.all,
        type: "active",
      })
    );
    expect(client.refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: activityKeys.all,
        type: "active",
      })
    );
    expect(client.refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: searchKeys.all,
        type: "active",
      })
    );
  });

  it("invalidateAfterJobMutation soft-invalidates jobs and activity", async () => {
    const client = mockClient();
    await invalidateAfterJobMutation(client, "case-1");
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: jobsKeys.all("case-1"),
      refetchType: "none",
    });
    expect(client.refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: jobsKeys.all("case-1"),
        type: "active",
      })
    );
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: activityKeys.all,
      refetchType: "none",
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: searchKeys.all,
      refetchType: "none",
    });
  });

  it("every Case data change also refreshes the tile counts", async () => {
    for (const run of [
      invalidateAfterJobMutation,
      invalidateAfterProposalAccept,
      invalidateAfterEntityChanged,
      invalidateAfterGraphActivity,
    ]) {
      const client = mockClient();
      // oxlint-disable-next-line eslint/no-await-in-loop -- one client per call, checked in turn
      await run(client, "case-1");
      expect(client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: casesKeys.counts(),
        refetchType: "none",
      });
    }
  });

  it("invalidateAfterProposalAccept refreshes graph and inbox slices", async () => {
    const client = mockClient();
    await invalidateAfterProposalAccept(client, "case-1");
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: proposalsKeys.all("case-1"),
      refetchType: "none",
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: entitiesKeys.all("case-1"),
      refetchType: "none",
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: historyKeys.prefix("case-1"),
      refetchType: "none",
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: searchKeys.all,
      refetchType: "none",
    });
  });

  it("invalidateAfterEntityChanged refreshes proposals and activity", async () => {
    const client = mockClient();
    await invalidateAfterEntityChanged(client, "case-1");
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: proposalsKeys.all("case-1"),
      refetchType: "none",
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: activityKeys.all,
      refetchType: "none",
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: searchKeys.all,
      refetchType: "none",
    });
  });

  it("invalidateAfterGraphActivity refreshes every entity-scoped slice of the Case", async () => {
    const client = mockClient();
    await invalidateAfterGraphActivity(client, "case-1");
    for (const queryKey of [
      entitiesKeys.all("case-1"),
      edgesKeys.prefix("case-1"),
      identifiersKeys.prefix("case-1"),
      claimsKeys.prefix("case-1"),
      eventsKeys.prefix("case-1"),
      questionsKeys.prefix("case-1"),
      proposalsKeys.all("case-1"),
      activityKeys.all,
      searchKeys.all,
    ]) {
      expect(client.invalidateQueries).toHaveBeenCalledWith({
        queryKey,
        refetchType: "none",
      });
      expect(client.refetchQueries).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey,
          type: "active",
        })
      );
    }
  });

  it("invalidateAfterResync marks every query stale and refetches the active ones", async () => {
    const client = mockClient();
    await invalidateAfterResync(client);
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      refetchType: "none",
    });
    expect(client.refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({ type: "active" })
    );
  });

  it("bindCasesChangedInvalidation listens for case switch events", async () => {
    const client = mockClient();
    const unbind = bindCasesChangedInvalidation(client);
    window.dispatchEvent(new Event(CASES_CHANGED_EVENT));
    await vi.waitFor(() => {
      expect(client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: casesKeys.all,
        refetchType: "none",
      });
    });
    unbind();
  });
});

describe("parallel refetch after a mutation", () => {
  /** A QueryClient whose refetchQueries calls are held open until the test releases them. */
  function heldClient() {
    const started: unknown[] = [];
    const releases: (() => void)[] = [];
    const client = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      refetchQueries: vi.fn(async (filters: unknown) => {
        started.push(filters);
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
      }),
      getQueryCache: noListViews,
    } as unknown as QueryClient;
    return { client, started, releases };
  }

  it("starts every Accept refetch before any of them resolves", async () => {
    const { client, started, releases } = heldClient();
    const done = vi.fn();
    const pending = (async () => {
      await invalidateAfterProposalAccept(client, "case-1");
      done();
    })();

    // proposals, entities, evidence, claims, edges, events, identifiers, questions, history, activity, search, counts
    await vi.waitFor(() => {
      expect(started).toHaveLength(12);
    });
    expect(done).not.toHaveBeenCalled();

    for (const release of releases) release();
    await pending;
    expect(done).toHaveBeenCalledOnce();
  });

  it("marks every key invalid before the first refetch starts", async () => {
    const order: string[] = [];
    const client = {
      invalidateQueries: vi.fn(async () => {
        order.push("invalidate");
      }),
      refetchQueries: vi.fn(async () => {
        order.push("refetch");
      }),
      getQueryCache: noListViews,
    } as unknown as QueryClient;
    await invalidateAfterProposalAccept(client, "case-1");
    const firstRefetch = order.indexOf("refetch");
    expect(order.slice(0, firstRefetch)).toHaveLength(12);
    expect(order.slice(firstRefetch).every((step) => step === "refetch")).toBe(
      true
    );
  });

  it("does not refetch a key twice within one call", async () => {
    const client = mockClient();
    await invalidateAfterEntityChanged(client, "case-1", {
      entityId: "e1",
      slug: "ada",
    });
    const refetched = vi
      .mocked(client.refetchQueries)
      .mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(new Set(refetched).size).toBe(refetched.length);
  });

  it("waits for the other refetches when one fails, then rejects with that failure", async () => {
    const boom = new Error("refetch failed");
    const settled: string[] = [];
    const client = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      refetchQueries: vi.fn(
        async (filters: { queryKey?: readonly unknown[] }) => {
          if (filters.queryKey?.[0] === "entities") {
            settled.push("entities");
            throw boom;
          }
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 20);
          });
          settled.push(String(filters.queryKey?.[0]));
        }
      ),
      getQueryCache: noListViews,
    } as unknown as QueryClient;

    await expect(invalidateAfterProposalAccept(client, "case-1")).rejects.toBe(
      boom
    );
    // Nothing was left running and no slice was skipped: all ten ran to completion.
    expect(settled).toHaveLength(12);
  });

  it("leaves every active slice fresh after one round (real QueryClient)", async () => {
    const { QueryClient: RealQueryClient, QueryObserver } =
      await import("@tanstack/react-query");
    const client = new RealQueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: false } },
    });
    const keys = [
      proposalsKeys.all("case-1"),
      entitiesKeys.all("case-1"),
      claimsKeys.prefix("case-1"),
      edgesKeys.prefix("case-1"),
      eventsKeys.prefix("case-1"),
      identifiersKeys.prefix("case-1"),
      questionsKeys.prefix("case-1"),
      historyKeys.prefix("case-1"),
      activityKeys.all,
      searchKeys.all,
    ];
    let inFlight = 0;
    let peak = 0;
    const generation = new Map<string, number>();
    const unsubscribe = keys.map((queryKey) => {
      const id = JSON.stringify(queryKey);
      const observer = new QueryObserver(client, {
        queryKey,
        queryFn: async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 15);
          });
          inFlight -= 1;
          const next = (generation.get(id) ?? 0) + 1;
          generation.set(id, next);
          return next;
        },
      });
      return observer.subscribe(() => undefined);
    });
    await vi.waitFor(() => {
      expect(inFlight).toBe(0);
      expect(generation.size).toBe(keys.length);
    });
    peak = 0;

    await invalidateAfterProposalAccept(client, "case-1");

    for (const queryKey of keys) {
      const state = client.getQueryState(queryKey);
      expect(state?.data, JSON.stringify(queryKey)).toBe(2);
      expect(state?.isInvalidated).toBe(false);
      expect(state?.fetchStatus).toBe("idle");
    }
    // Every active slice was in flight at once: one round, not nine.
    expect(peak).toBe(keys.length);
    for (const stop of unsubscribe) stop();
  });

  it("throttles a declared list's view: a burst refetches it once now and once at the window's end", async () => {
    vi.useFakeTimers();
    const { QueryClient: RealQueryClient, QueryObserver } =
      await import("@tanstack/react-query");
    const client = new RealQueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: false } },
    });
    let fetches = 0;
    const observer = new QueryObserver(client, {
      queryKey: [...entitiesKeys.all("case-1"), "list", "entities", "[]"],
      meta: { isListView: true },
      queryFn: async () => {
        fetches += 1;
        return fetches;
      },
    });
    const stop = observer.subscribe(() => undefined);
    try {
      await vi.waitFor(() => {
        expect(fetches).toBe(1);
      });

      const burst = Array.from({ length: 4 }, async () =>
        invalidateAfterEntityChanged(client, "case-1")
      );
      await vi.advanceTimersByTimeAsync(0);
      // The first invalidation refetched at once; the other three wait for the window.
      expect(fetches).toBe(2);
      await vi.advanceTimersByTimeAsync(LIST_REFETCH_THROTTLE_MS);
      await Promise.all(burst);
      expect(fetches).toBe(3);
    } finally {
      stop();
      vi.useRealTimers();
    }
  });
});
