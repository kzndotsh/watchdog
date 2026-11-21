import type { useNavigate } from "@tanstack/react-router";

import { WORK_TO, workSearch } from "@/config/nav";
import type { CaseRecord } from "@/domains/cases/types";
import { caseRouteScreen } from "@/shared/lib/case-path";

/** The router's own `navigate`, so every `to`, `params` and `search` below is checked against the route tree. */
export type CaseSwitchNavigate = ReturnType<typeof useNavigate>;

/**
 * A switch made on a Case's URL moves to the same screen of the new Case (a Dossier or a
 * selection belongs to the old Case, so it lands on the screen's list): the URL is what names
 * the Active Case. Case-less screens stay put: they follow the last Case entered.
 */
export async function navigateAfterActiveCaseSwitch(input: {
  next: CaseRecord;
  pathname: string;
  navigate: CaseSwitchNavigate;
}): Promise<void> {
  const screen = caseRouteScreen(input.pathname);
  if (screen === null) return;
  const params = { caseSlug: input.next.slug };
  if (screen === "overview") {
    await input.navigate({ to: "/cases/$caseSlug", params, replace: true });
    return;
  }
  await input.navigate({
    to: WORK_TO[screen],
    params,
    search: workSearch(screen),
    replace: true,
  });
}
