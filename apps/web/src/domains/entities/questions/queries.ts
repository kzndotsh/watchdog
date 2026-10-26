import { listQuestionsPageFn } from "@/domains/entities/questions/questions.functions";
import type { QuestionRecord } from "@/domains/entities/questions/types";
import { listView } from "@/shared/lib/list/list-view";
import { scopeCaseId, scopeCaseIdEnabled } from "@/shared/lib/query-ingress";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { questionList } from "@watchdog/schemas/graph";

export const questionsKeys = {
  prefix: (caseId: string) => ["questions", caseId] as const,
};

/**
 * The Case's Question list (`questionList`, ADR-0007), a page at a time: the Dossier Questions tab is this
 * list with `entityId` fixed. Keys sit under `questionsKeys.prefix`, so every Entity, Proposal and live
 * Graph invalidation refreshes each open view.
 */
export const questionListView = listView(questionList, {
  domain: "questions",
  scopeKey: ({ caseId }: { readonly caseId: string }) => [scopeCaseId(caseId)],
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  fetchPage: async ({ scope, params, cursor }) =>
    listQuestionsPageFn({
      data: {
        ...params,
        caseId: scopeCaseId(scope.caseId),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  getId: (row: QuestionRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});
