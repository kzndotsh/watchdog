import { WORK_TO, type WorkScreen } from "@/config/nav";

function isWorkScreen(segment: string): segment is WorkScreen {
  return Object.hasOwn(WORK_TO, segment);
}

/**
 * Where a pathname sits under a Case: `null` outside `/cases/$caseSlug/...` (Dashboard,
 * the Cases list, Settings), `"overview"` on the Case Overview, else the Work screen.
 * Anything under a screen (a Dossier under Entities) counts as that screen.
 */
export function caseRouteScreen(
  pathname: string
): WorkScreen | "overview" | null {
  const [, head, slug, segment] = pathname.split("/");
  if (head !== "cases" || !slug) return null;
  if (segment === undefined || !isWorkScreen(segment)) return "overview";
  return segment;
}

/**
 * The Dossier's path for a Case and an Entity slug, built from the route pattern so it
 * cannot drift from the router.
 */
export function dossierPath(caseSlug: string, entitySlug: string): string {
  const screen = WORK_TO.entities.replace(
    "$caseSlug",
    encodeURIComponent(caseSlug)
  );
  return `${screen}/${encodeURIComponent(entitySlug)}`;
}
