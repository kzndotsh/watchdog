import type { QueryClient } from "@tanstack/react-query";

import { activityKeys } from "@/domains/activity/queries";
import { CASES_CHANGED_EVENT } from "@/domains/cases/lib/active-case";
import { casesKeys } from "@/domains/cases/queries";
import { claimsKeys } from "@/domains/entities/claims/queries";
import { edgesKeys } from "@/domains/entities/edges/queries";
import { eventsKeys } from "@/domains/entities/events/queries";
import { identifiersKeys } from "@/domains/entities/identifiers/queries";
import { entitiesKeys } from "@/domains/entities/queries";
import { questionsKeys } from "@/domains/entities/questions/queries";
import { evidenceKeys } from "@/domains/intake/queries";
import { jobsKeys } from "@/domains/jobs/jobs-keys";
import { credentialsKeys } from "@/domains/settings/queries";
import { tasksKeys } from "@/domains/tasks/queries";
import { proposalsKeys } from "@/domains/triage/queries";

interface EntityChangedOpts {
  entityId?: string;
  slug?: string;
}

/** Soft settle: mark stale without flashing loading, then refetch active observers. */
async function softInvalidate(
  client: QueryClient,
  queryKey: readonly unknown[]
): Promise<void> {
  await client.invalidateQueries({ queryKey, refetchType: "none" });
  await client.refetchQueries({ queryKey, type: "active" });
}

export async function invalidateAfterCaseSwitch(
  client: QueryClient
): Promise<void> {
  await client.invalidateQueries({ queryKey: casesKeys.all });
}

export async function invalidateAfterJobMutation(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, jobsKeys.all(caseId));
  await softInvalidate(client, activityKeys.all);
}

export async function invalidateAfterProposalAccept(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, proposalsKeys.all(caseId));
  await softInvalidate(client, entitiesKeys.all(caseId));
  await softInvalidate(client, evidenceKeys.all(caseId));
  await softInvalidate(client, claimsKeys.prefix(caseId));
  await softInvalidate(client, edgesKeys.prefix(caseId));
  await softInvalidate(client, eventsKeys.prefix(caseId));
  await softInvalidate(client, identifiersKeys.prefix(caseId));
  await softInvalidate(client, questionsKeys.prefix(caseId));
  await softInvalidate(client, activityKeys.all);
}

export async function invalidateAfterProposalQueueChange(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, proposalsKeys.all(caseId));
  await softInvalidate(client, activityKeys.all);
}

export async function invalidateAfterEntityChanged(
  client: QueryClient,
  caseId: string,
  opts?: EntityChangedOpts
): Promise<void> {
  await softInvalidate(client, entitiesKeys.all(caseId));
  if (opts?.slug) {
    await softInvalidate(client, entitiesKeys.detail(caseId, opts.slug));
  }
  await Promise.all([
    softInvalidate(client, edgesKeys.prefix(caseId)),
    softInvalidate(client, identifiersKeys.prefix(caseId)),
  ]);
  if (opts?.entityId) {
    await Promise.all([
      softInvalidate(client, claimsKeys.all(caseId, opts.entityId)),
      softInvalidate(client, eventsKeys.all(caseId, opts.entityId)),
      softInvalidate(client, questionsKeys.all(caseId, opts.entityId)),
    ]);
  }
}

export async function invalidateAfterTaskMutation(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, tasksKeys.all(caseId));
  await softInvalidate(client, activityKeys.all);
}

export async function invalidateAfterEvidenceMutation(
  client: QueryClient,
  caseId: string
): Promise<void> {
  await softInvalidate(client, evidenceKeys.all(caseId));
  await softInvalidate(client, activityKeys.all);
}

export async function invalidateAfterCredentialMutation(
  client: QueryClient
): Promise<void> {
  await softInvalidate(client, credentialsKeys.all);
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
