import type { QuestionRecord } from "@/domains/entities/questions/types";
import { orpc } from "@/lib/orpc-client";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { questionList } from "@watchdog/domain/schemas/graph";

/**
 * Questions keys are the oRPC procedure keys: `all(caseId)` is
 * `[["questions"], { input: { caseId } }]`, every Questions query of the Case whatever its
 * procedure, filters or cursor.
 */
export const questionsKeys = {
  all: (caseId: string) => orpc.questions.key({ input: { caseId } }),
};

/**
 * The Case's Question list (`questionList`, ADR-0007), a page at a time through `questions.list`:
 * the Dossier Questions tab is this list with `entityId` fixed. Keys sit under
 * `questionsKeys.all`, so every Entity, Proposal and live Graph invalidation refreshes each open
 * view.
 */
export const questionListView = listView(questionList, {
  procedure: orpc.questions.list,
  scopeInput: ({ caseId }: { readonly caseId: string }) => ({
    caseId: scopeCaseId(caseId),
  }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scopeCaseId(scope.caseId),
    ...(cursor === undefined ? {} : { cursor }),
  }),
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  getId: (row: QuestionRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});
