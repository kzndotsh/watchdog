import { authQueryKeys } from "@better-auth-ui/core";
import type { Query, QueryClient } from "@tanstack/react-query";

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
import { evidenceKeys } from "@/domains/intake/queries";
import { jobsKeys } from "@/domains/jobs/jobs-keys";
import { organizationKeys } from "@/domains/organization/queries";
import { searchKeys } from "@/domains/search/queries";
import { credentialsKeys } from "@/domains/settings/queries";
import { tasksKeys } from "@/domains/tasks/queries";
import { proposalsKeys } from "@/domains/triage/queries";
import {
  isListViewQuery,
  throttledListRefetch,
} from "@/shared/lib/list/list-refetch-throttle";

type EntityChangedOpts = {
  entityId?: string;
  slug?: string;
};

type QueryKey = readonly unknown[];

function startsWith(key: QueryKey, prefix: QueryKey): boolean {
  return (
    key.length >= prefix.length &&
    prefix.every((part, index) => part === key[index])
  );
}

/** Drops a key that another key in the list already covers (TanStack matches by prefix). */
function withoutCovered(keys: readonly QueryKey[]): QueryKey[] {
  return keys.filter(
    (key, index) =>
      !keys.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          startsWith(key, other) &&
          (other.length < key.length || otherIndex < index)
      )
  );
}

/** One list view's throttled refresh; a failure shows on the list (its error state, the toast). */
async function refreshListView(
  client: QueryClient,
  query: Query
): Promise<void> {
  try {
    await throttledListRefetch(client, query, async () => {
      await client.refetchQueries({
        queryKey: query.queryKey,
        exact: true,
        type: "active",
      });
    });
  } catch {
    // Reported by the query itself, not by the mutation that invalidated it.
  }
}

/**
 * Soft settle for every affected key at once: mark them all stale without flashing
 * loading, then refetch the active observers of all of them in parallel, so the
 * slices are fresh after one round instead of one round per key.
 *
 * Resolves when every refetch has finished. When some fail it still waits for the rest
 * (no slice is skipped or left running), then rejects with the first failure, as the
 * serial version rejected at the first one.
 */
async function softInvalidate(
  client: QueryClient,
  keys: readonly QueryKey[]
): Promise<void> {
  const affected = withoutCovered(keys);
  await Promise.all(
    affected.map(async (queryKey) =>
      client.invalidateQueries({ queryKey, refetchType: "none" })
    )
  );
  // A declared list's views (`meta.isListView`) refetch through the per-view throttle in the
  // background: an ingest burst re-walks each open view's pages once per window, and a mutation
  // awaiting this never waits for a trailing walk. A failed walk shows on the list itself (its
  // query error and the QueryCache toast).
  for (const queryKey of affected) {
    for (const query of client
      .getQueryCache()
      .findAll({ queryKey, type: "active", predicate: isListViewQuery })) {
      void refreshListView(client, query);
    }
  }
  const results = await Promise.allSettled(
    affected.map(async (queryKey) =>
      client.refetchQueries({
        queryKey,
        type: "active",
        predicate: (query) => !isListViewQuery(query),
      })
    )
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

/** What every Case-scoped mutation also refreshes: the activity feed and search. */
const feedKeys = [activityKeys.all, searchKeys.all] as const;

/** A change to a Case's data also refreshes its tile counts. */
const caseDataKeys = [...feedKeys, casesKeys.counts()] as const;

export async function invalidateAfterCaseSwitch(
  client: QueryClient
): Promise<void> {
  await softInvalidate(client, [casesKeys.all, ...feedKeys]);
}

/** Re-read the organization's settings (a handoff the server refused means they changed). */
export async function invalidateOrganizationSettings(
  client: QueryClient
): Promise<void> {
  await client.invalidateQueries({ queryKey: organizationKeys.settings() });
}

/** An entry that only shows in Recent activity (an external AI handoff): refresh the feed and search. */
export async function invalidateAfterFeedEntry(
  client: QueryClient
): Promise<void> {
  await softInvalidate(client, [...feedKeys]);
}

export async function invalidateAfterJobMutation(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, [jobsKeys.all(caseId), ...caseDataKeys]);
}

/** New log lines of one running Job (`job.logged`): refresh its open detail, nothing else. */
export async function invalidateAfterJobLog(
  client: QueryClient,
  caseId: string,
  jobId: string
): Promise<void> {
  await softInvalidate(client, [jobsKeys.detail(caseId, jobId)]);
}

export async function invalidateAfterProposalAccept(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, [
    proposalsKeys.all(caseId),
    entitiesKeys.all(caseId),
    evidenceKeys.all(caseId),
    claimsKeys.prefix(caseId),
    edgesKeys.prefix(caseId),
    eventsKeys.prefix(caseId),
    identifiersKeys.prefix(caseId),
    questionsKeys.prefix(caseId),
    historyKeys.prefix(caseId),
    ...caseDataKeys,
  ]);
}

export async function invalidateAfterProposalQueueChange(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, [proposalsKeys.all(caseId), ...caseDataKeys]);
}

function entityChangedKeys(
  caseId: string,
  opts?: EntityChangedOpts
): QueryKey[] {
  return [
    entitiesKeys.all(caseId),
    ...(opts?.slug ? [entitiesKeys.detail(caseId, opts.slug)] : []),
    edgesKeys.prefix(caseId),
    identifiersKeys.prefix(caseId),
    proposalsKeys.all(caseId),
    historyKeys.prefix(caseId),
    ...caseDataKeys,
    // Claims, Events and Questions are Case-wide lists (an Entity's are a view with `entityId`
    // fixed): a write on an Entity refreshes the Case's views, each throttled per view.
    ...(opts?.entityId
      ? [
          claimsKeys.prefix(caseId),
          eventsKeys.prefix(caseId),
          questionsKeys.prefix(caseId),
        ]
      : []),
  ];
}

export async function invalidateAfterEntityChanged(
  client: QueryClient,
  caseId: string,
  opts?: EntityChangedOpts
): Promise<void> {
  await softInvalidate(client, entityChangedKeys(caseId, opts));
}

/**
 * A Graph entry (Entity, Edge, Claim, Identifier, timeline Event, Open
 * Question) arrived for the Case: the entity slices, including every view of
 * the Case's Claim, Event and Question lists.
 */
export async function invalidateAfterGraphActivity(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, [
    ...entityChangedKeys(caseId),
    claimsKeys.prefix(caseId),
    eventsKeys.prefix(caseId),
    questionsKeys.prefix(caseId),
  ]);
}

/**
 * The server could not replay what this client missed (`resync`): nothing
 * cached can be trusted, so mark every query stale and refetch the active ones.
 */
export async function invalidateAfterResync(
  client: QueryClient
): Promise<void> {
  await client.invalidateQueries({ refetchType: "none" });
  await client.refetchQueries({ type: "active" });
}

export async function invalidateAfterTaskMutation(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, [tasksKeys.all(caseId), ...caseDataKeys]);
}

export async function invalidateAfterEvidenceMutation(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, [evidenceKeys.all(caseId), ...caseDataKeys]);
}

/**
 * The signed-in user's organization membership or active organization changed (create,
 * switch, join, leave, delete, remove member). Marks the cached organization state and the
 * session stale, without fetching: the route guard re-reads both on the next navigation
 * (every current caller then hard-navigates to `/`, which drops the cache as well).
 */
export async function invalidateAfterOrganizationChange(
  client: QueryClient
): Promise<void> {
  await Promise.all([
    client.invalidateQueries({
      queryKey: organizationKeys.stateAll(),
      refetchType: "none",
    }),
    client.invalidateQueries({
      queryKey: authQueryKeys.session,
      refetchType: "none",
    }),
  ]);
}

/**
 * Answer the route guard's organization question from the session's active organization,
 * so a first navigation on the client does not make a second request (see
 * `ensureOrganizationState`). Only ever called while nothing is cached for the user.
 */
export function seedOrganizationState(
  client: QueryClient,
  userId: string,
  organizationId: string
): void {
  client.setQueryData(organizationKeys.state(userId), { organizationId });
}

/**
 * A server function answered Unauthorized: the session is gone. Mark it stale and refetch
 * its active observers now, so `useAuthenticate` in the protected layout redirects to
 * sign-in instead of waiting out the session's stale time.
 */
export async function invalidateAfterUnauthorized(
  client: QueryClient
): Promise<void> {
  await client.invalidateQueries(
    { queryKey: authQueryKeys.session },
    { cancelRefetch: false }
  );
}

export async function invalidateAfterCredentialMutation(
  client: QueryClient
): Promise<void> {
  await softInvalidate(client, [credentialsKeys.all]);
}

/** Listen for Case switch CustomEvent and run the case invalidation contract. */
export function bindCasesChangedInvalidation(client: QueryClient): () => void {
  function onCasesChanged() {
    void invalidateAfterCaseSwitch(client);
  }
  window.addEventListener(CASES_CHANGED_EVENT, onCasesChanged);
  return () => {
    window.removeEventListener(CASES_CHANGED_EVENT, onCasesChanged);
  };
}
