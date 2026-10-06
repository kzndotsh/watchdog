import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import { activityKeys } from "@/domains/activity/queries";
import { CASES_CHANGED_EVENT } from "@/domains/cases/lib/active-case";
import { casesKeys } from "@/domains/cases/queries";
import { claimsKeys } from "@/domains/entities/claims/queries";
import { edgesKeys } from "@/domains/entities/edges/queries";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { eventsKeys } from "@/domains/entities/events/queries";
import { identifiersKeys } from "@/domains/entities/identifiers/queries";
import { questionsKeys } from "@/domains/entities/questions/queries";
import { jobsKeys } from "@/domains/jobs/queries";
import { searchKeys } from "@/domains/search/queries";
import { proposalsKeys } from "@/domains/triage/queries";
import {
  bindCasesChangedInvalidation,
  invalidateAfterCaseSwitch,
  invalidateAfterEntityChanged,
  invalidateAfterGraphActivity,
  invalidateAfterResync,
  invalidateAfterJobMutation,
  invalidateAfterProposalAccept,
} from "@/shared/lib/query-invalidation";

function mockClient(): QueryClient {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    refetchQueries: vi.fn().mockResolvedValue(undefined),
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
    expect(client.refetchQueries).toHaveBeenCalledWith({
      queryKey: casesKeys.all,
      type: "active",
    });
    expect(client.refetchQueries).toHaveBeenCalledWith({
      queryKey: activityKeys.all,
      type: "active",
    });
    expect(client.refetchQueries).toHaveBeenCalledWith({
      queryKey: searchKeys.all,
      type: "active",
    });
  });

  it("invalidateAfterJobMutation soft-invalidates jobs and activity", async () => {
    const client = mockClient();
    await invalidateAfterJobMutation(client, "case-1");
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: jobsKeys.all("case-1"),
      refetchType: "none",
    });
    expect(client.refetchQueries).toHaveBeenCalledWith({
      queryKey: jobsKeys.all("case-1"),
      type: "active",
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
      expect(client.refetchQueries).toHaveBeenCalledWith({
        queryKey,
        type: "active",
      });
    }
  });

  it("invalidateAfterResync marks every query stale and refetches the active ones", async () => {
    const client = mockClient();
    await invalidateAfterResync(client);
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      refetchType: "none",
    });
    expect(client.refetchQueries).toHaveBeenCalledWith({ type: "active" });
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
