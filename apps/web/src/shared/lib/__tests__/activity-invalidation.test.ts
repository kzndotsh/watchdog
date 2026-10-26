import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";

const streamMock = vi.hoisted(() => ({
  handlers: undefined as
    | { onEntry: (entry: unknown) => void; onResync: () => void }
    | undefined,
  unsubscribe: vi.fn(),
}));

vi.mock("@/shared/lib/activity-stream", () => ({
  subscribeActivityStream: (
    handlers: NonNullable<typeof streamMock.handlers>
  ) => {
    streamMock.handlers = handlers;
    return streamMock.unsubscribe;
  },
}));

import { activityKeys } from "@/domains/activity/queries";
import { casesKeys } from "@/domains/cases/queries";
import { claimsKeys } from "@/domains/entities/claims/queries";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { evidenceKeys } from "@/domains/intake/queries";
import { jobsKeys } from "@/domains/jobs/jobs-keys";
import { tasksKeys } from "@/domains/tasks/queries";
import { proposalsKeys } from "@/domains/triage/queries";
import {
  bindActivityInvalidation,
  invalidateForActivity,
} from "@/shared/lib/activity-invalidation";
import {
  ACTIVITY_ENTRY_ACTIONS,
  ACTIVITY_ENTRY_KINDS,
} from "@watchdog/schemas/feed";
import type { ActivityEntry, ActivityEntryKind } from "@watchdog/schemas/feed";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const CASE_A = testCaseId(10);
const CASE_B = testCaseId(11);
const JOB_ID = testId(21);

function mockClient(): QueryClient {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    refetchQueries: vi.fn().mockResolvedValue(undefined),
    // No declared list view is cached: every key refetches directly.
    getQueryCache: () => ({ findAll: () => [] }),
  } as unknown as QueryClient;
}

function invalidated(client: QueryClient): unknown[] {
  return vi
    .mocked(client.invalidateQueries)
    .mock.calls.map(([filters]) => filters?.queryKey);
}

function entry(
  kind: ActivityEntryKind,
  caseId: CaseId = CASE_A,
  action: string = ACTIVITY_ENTRY_ACTIONS[kind][0]
): ActivityEntry {
  return {
    cursor: "0:1",
    id: 1,
    caseId,
    kind,
    action,
    subjectId: null,
    groupId: null,
    label: null,
    actorId: null,
    actorLabel: null,
    fromValue: null,
    toValue: null,
    at: "2026-01-01T00:00:00.000Z",
  };
}

describe("invalidateForActivity", () => {
  it("task entries refresh the Case's tasks and the feed", async () => {
    const client = mockClient();
    await invalidateForActivity(client, entry("task"));
    expect(invalidated(client)).toEqual(
      expect.arrayContaining([tasksKeys.all(CASE_A), activityKeys.all])
    );
  });

  it("job entries refresh the Case's jobs and the feed", async () => {
    const client = mockClient();
    await invalidateForActivity(client, entry("job", CASE_A, "succeeded"));
    expect(invalidated(client)).toEqual(
      expect.arrayContaining([jobsKeys.all(CASE_A), activityKeys.all])
    );
  });

  it("a Job's saved log lines refresh only that Job's detail, not the queue or the feed", async () => {
    const client = mockClient();
    await invalidateForActivity(client, {
      ...entry("job", CASE_A, "logged"),
      subjectId: JOB_ID,
    });
    expect(invalidated(client)).toEqual([jobsKeys.detail(CASE_A, JOB_ID)]);
  });

  it("playbook_run entries refresh the Case's jobs, its run views and the feed", async () => {
    const client = mockClient();
    await invalidateForActivity(
      client,
      entry("playbook_run", CASE_A, "finished")
    );
    expect(invalidated(client)).toEqual(
      expect.arrayContaining([jobsKeys.all(CASE_A), activityKeys.all])
    );
    // The run view sits under the Case's jobs prefix, so this refetches it.
    expect(jobsKeys.playbookRun(CASE_A, "run-1").slice(0, 2)).toEqual(
      jobsKeys.all(CASE_A)
    );
  });

  it("evidence entries refresh the Case's evidence and the feed", async () => {
    const client = mockClient();
    await invalidateForActivity(client, entry("evidence"));
    expect(invalidated(client)).toEqual(
      expect.arrayContaining([evidenceKeys.all(CASE_A), activityKeys.all])
    );
  });

  it.each(["created", "accepted", "rejected"])(
    "proposal %s refreshes the Case's Triage queue and the feed",
    async (action) => {
      const client = mockClient();
      await invalidateForActivity(client, entry("proposal", CASE_A, action));
      expect(invalidated(client)).toEqual(
        expect.arrayContaining([proposalsKeys.all(CASE_A), activityKeys.all])
      );
    }
  );

  it.each([
    "entity",
    "edge",
    "claim",
    "identifier",
    "event",
    "question",
  ] as const)("%s entries refresh the Case's graph slices", async (kind) => {
    const client = mockClient();
    await invalidateForActivity(client, entry(kind));
    expect(invalidated(client)).toEqual(
      expect.arrayContaining([
        entitiesKeys.all(CASE_A),
        claimsKeys.prefix(CASE_A),
        proposalsKeys.all(CASE_A),
        activityKeys.all,
      ])
    );
  });

  it("handoff entries refresh only the feed, not the Case's Graph slices", async () => {
    const client = mockClient();
    await invalidateForActivity(client, entry("handoff"));
    const keys = invalidated(client);
    expect(keys).toContainEqual(activityKeys.all);
    expect(keys).not.toContainEqual(entitiesKeys.all(CASE_A));
    expect(keys).not.toContainEqual(tasksKeys.all(CASE_A));
  });

  it("case entries refresh the Case list and the feed", async () => {
    const client = mockClient();
    await invalidateForActivity(client, entry("case"));
    expect(invalidated(client)).toEqual(
      expect.arrayContaining([casesKeys.all, activityKeys.all])
    );
  });

  it("touches only the entry's own Case", async () => {
    const client = mockClient();
    await invalidateForActivity(client, entry("task", CASE_B));
    expect(invalidated(client)).not.toContainEqual(tasksKeys.all(CASE_A));
    expect(invalidated(client)).toContainEqual(tasksKeys.all(CASE_B));
  });

  it("handles every kind of the log", async () => {
    for (const kind of ACTIVITY_ENTRY_KINDS) {
      const client = mockClient();
      // oxlint-disable-next-line eslint/no-await-in-loop -- one client per kind
      await invalidateForActivity(client, entry(kind));
      expect(
        client.invalidateQueries,
        `no invalidation for ${kind}`
      ).toHaveBeenCalled();
    }
  });
});

describe("bindActivityInvalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    streamMock.handlers = undefined;
    streamMock.unsubscribe.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invalidates for each entry the stream delivers", async () => {
    const client = mockClient();
    const unbind = bindActivityInvalidation(client);
    streamMock.handlers?.onEntry(entry("task"));
    await vi.advanceTimersByTimeAsync(200);
    expect(invalidated(client)).toContainEqual(tasksKeys.all(CASE_A));
    unbind();
  });

  it("coalesces a burst of the same kind for the same Case into one pass", async () => {
    const client = mockClient();
    const unbind = bindActivityInvalidation(client);
    for (let i = 0; i < 20; i += 1) {
      streamMock.handlers?.onEntry(entry("claim"));
    }
    streamMock.handlers?.onEntry(entry("claim", CASE_B));
    await vi.advanceTimersByTimeAsync(200);
    const mine = invalidated(client).filter(
      (key) => JSON.stringify(key) === JSON.stringify(entitiesKeys.all(CASE_A))
    );
    expect(mine).toHaveLength(1);
    expect(invalidated(client)).toContainEqual(entitiesKeys.all(CASE_B));
    unbind();
  });

  it("coalesces a burst of one Job's log batches, and keeps two Jobs apart", async () => {
    const client = mockClient();
    const unbind = bindActivityInvalidation(client);
    const other = testId(22);
    for (let i = 0; i < 20; i += 1) {
      streamMock.handlers?.onEntry({
        ...entry("job", CASE_A, "logged"),
        subjectId: JOB_ID,
      });
    }
    streamMock.handlers?.onEntry({
      ...entry("job", CASE_A, "logged"),
      subjectId: other,
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(invalidated(client)).toEqual([
      jobsKeys.detail(CASE_A, JOB_ID),
      jobsKeys.detail(CASE_A, other),
    ]);
    unbind();
  });

  it("invalidates everything on resync", async () => {
    const client = mockClient();
    const unbind = bindActivityInvalidation(client);
    streamMock.handlers?.onResync();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      refetchType: "none",
    });
    expect(client.refetchQueries).toHaveBeenCalledWith({ type: "active" });
    unbind();
  });

  it("drops pending work and unsubscribes on unbind", async () => {
    const client = mockClient();
    const unbind = bindActivityInvalidation(client);
    streamMock.handlers?.onEntry(entry("task"));
    unbind();
    await vi.advanceTimersByTimeAsync(200);
    expect(streamMock.unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.invalidateQueries).not.toHaveBeenCalled();
  });
});
