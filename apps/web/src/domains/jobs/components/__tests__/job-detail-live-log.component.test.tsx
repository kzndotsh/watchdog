import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, cleanup, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActivityEntry } from "@watchdog/schemas/feed";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

type Listener = (event: Event) => void;

/** The browser's `EventSource` is the boundary: the real stream module runs over this one. */
class EventSourceDouble {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: EventSourceDouble[] = [];
  listeners = new Map<string, Set<Listener>>();
  readyState = EventSourceDouble.OPEN;

  url: string;

  constructor(url: string) {
    this.url = url;
    EventSourceDouble.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.readyState = EventSourceDouble.CLOSED;
  }

  emit(type: string, data: string) {
    const event = new MessageEvent(type, { data });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

vi.mock("@/domains/jobs/jobs.functions", () => ({
  getJobFn: vi.fn(),
  getPlaybookRunFn: vi.fn(),
  listCapabilitiesFn: vi.fn(),
  listJobsFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}));

import { JobDetail } from "@/domains/jobs/components/job-detail";
import { getJobFn } from "@/domains/jobs/jobs.functions";
import { jobDetailQuery } from "@/domains/jobs/queries";
import { bindActivityInvalidation } from "@/shared/lib/activity-invalidation";
import { buildJobRecord } from "@/testing/records";
import { render } from "@/testing/render-in-case";

const CASE_ID = testCaseId(10);
const JOB_ID = testId(11);

/** The Job page as the app wires it: the detail query, the live stream bound to the Query cache. */
function LiveJobPage({ client }: { client: QueryClient }) {
  useEffect(() => bindActivityInvalidation(client), [client]);
  const { data } = useQuery(jobDetailQuery(CASE_ID, JOB_ID));
  return <JobDetail job={data ?? null} isBusy={false} onCancel={vi.fn()} />;
}

function loggedEntry(): ActivityEntry {
  return {
    cursor: "1:1",
    id: 1,
    caseId: CASE_ID,
    kind: "job",
    action: "logged",
    subjectId: JOB_ID,
    groupId: null,
    label: null,
    actorId: null,
    actorLabel: null,
    fromValue: null,
    toValue: "2",
    at: "2026-01-01T00:00:00.000Z",
  };
}

describe("Job detail while the Job runs", () => {
  afterEach(async () => {
    // The shared stream closes one tick after its last subscriber leaves, and only then forgets
    // its connection and last cursor: unmount and wait for that close before the next test opens it.
    cleanup();
    await waitFor(() => {
      expect(
        EventSourceDouble.instances.every(
          (source) => source.readyState === EventSourceDouble.CLOSED
        )
      ).toBe(true);
    });
    vi.unstubAllGlobals();
    EventSourceDouble.instances = [];
  });

  it("shows new log lines when the stream says they were saved, without a reload", async () => {
    vi.mocked(getJobFn)
      .mockResolvedValueOnce(
        buildJobRecord({
          id: JOB_ID,
          caseId: CASE_ID,
          status: "running",
          logs: ["collect started"],
        })
      )
      .mockResolvedValue(
        buildJobRecord({
          id: JOB_ID,
          caseId: CASE_ID,
          status: "running",
          logs: ["collect started", "resolved A record"],
        })
      );
    vi.stubGlobal("EventSource", EventSourceDouble);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <LiveJobPage client={client} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(document.body).toHaveTextContent("collect started");
    });
    expect(document.body).not.toHaveTextContent("resolved A record");

    // What the server pushes when the worker saved a batch of this Job's lines.
    act(() => {
      EventSourceDouble.instances[0]?.emit(
        "activity",
        JSON.stringify(loggedEntry())
      );
    });

    await waitFor(() => {
      expect(document.body).toHaveTextContent("resolved A record");
    });
    // The earlier line is still there: the page grew, it did not restart.
    expect(document.body).toHaveTextContent("collect started");
  });
});
