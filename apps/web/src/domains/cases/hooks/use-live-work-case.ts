import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import type { CaseRecord } from "@/domains/cases/types";
import { useWorkCase } from "@/shared/hooks/use-route-case";

/**
 * The Case of a Work screen: the one in the URL, read live from the cases list (an edit
 * such as the egress switch refetches it; the route's own row can be older) with the
 * route's row as the fallback. It throws outside a Case route and never falls back to
 * the cookie: a Work screen belongs to the Case in its URL.
 */
export function useLiveWorkCase(): CaseRecord {
  const routeCase = useWorkCase();
  const { cases } = useCasesContext({ silentError: true });
  return cases.find((row) => row.id === routeCase.id) ?? routeCase;
}
