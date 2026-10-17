import type { QueryClient } from "@tanstack/react-query";
import type { useNavigate } from "@tanstack/react-router";

import { WORK_TO } from "@/config/nav";
import { bumpActiveCaseHealEpoch } from "@/domains/cases/lib/active-case";
import { casesKeys } from "@/domains/cases/queries";
import type { CaseRecord, CasesContext } from "@/domains/cases/types";
import { parseOptionalTrimmedUuid } from "@watchdog/schemas/shared";

import { caseRouteScreen } from "./case-path";
import { invalidateAfterCaseSwitch } from "./query-invalidation";

export function optimisticActiveCaseSwitch(
  queryClient: QueryClient,
  cases: CaseRecord[],
  caseId: string
): Promise<{ prev: CasesContext | undefined; next: CaseRecord | undefined }> {
  const scopedId = parseOptionalTrimmedUuid(caseId);
  const next =
    scopedId === undefined ? undefined : cases.find((c) => c.id === scopedId);
  if (!next) {
    return Promise.resolve({ prev: undefined, next: undefined });
  }
  bumpActiveCaseHealEpoch();
  return queryClient
    .cancelQueries({ queryKey: casesKeys.context() })
    .then(() => {
      const prev = queryClient.getQueryData<CasesContext>(casesKeys.context());
      if (prev) {
        queryClient.setQueryData<CasesContext>(casesKeys.context(), {
          ...prev,
          active: next,
        });
      }
      return { prev, next };
    });
}

export function rollbackActiveCaseSwitch(
  queryClient: QueryClient,
  prev: CasesContext | undefined
): void {
  if (prev) {
    queryClient.setQueryData(casesKeys.context(), prev);
  }
}

export function finalizeActiveCaseSwitch(
  queryClient: QueryClient,
  next: CaseRecord | undefined
): Promise<void> {
  return invalidateAfterCaseSwitch(queryClient).then(() => {
    if (next) {
      queryClient.setQueryData<CasesContext>(casesKeys.context(), (prev) =>
        prev ? { ...prev, active: next } : prev
      );
    }
  });
}

/** The router's own `navigate`, so every `to`, `params` and `search` below is checked against the route tree. */
export type CaseSwitchNavigate = ReturnType<typeof useNavigate>;

/**
 * A switch made on a Case's URL moves to the same screen of the new Case (a Dossier or a
 * selection belongs to the old Case, so it lands on the screen's list). Without this the
 * Case route's heal snaps the cookie back to the Case still in the URL. Case-less screens
 * stay put: they follow the cookie.
 */
export function navigateAfterActiveCaseSwitch(input: {
  next: CaseRecord;
  pathname: string;
  navigate: CaseSwitchNavigate;
}): Promise<void> {
  const screen = caseRouteScreen(input.pathname);
  if (screen === null) return Promise.resolve();
  const params = { caseSlug: input.next.slug };
  if (screen === "overview") {
    return Promise.resolve(
      input.navigate({ to: "/cases/$caseSlug", params, replace: true })
    ).then(() => {});
  }
  return Promise.resolve(
    input.navigate({
      to: WORK_TO[screen],
      params,
      search: {},
      replace: true,
    })
  ).then(() => {});
}
