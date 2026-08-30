import type { PageTrailInput, TrailItem, TrailTo } from "./page-trail.types";

export type {
  CountOnTrailId,
  PageTrailInput,
  TrailItem,
  TrailTo,
} from "./page-trail.types";

function pathSegments(pathname: string): string[] {
  return pathname.replace(/\/+$/, "").split("/").filter(Boolean);
}

function current(id: string, label: string): TrailItem {
  return { id, label };
}

function link(id: string, label: string, href: TrailTo): TrailItem {
  return { id, label, href };
}

function caseCrumb(activeCase: { name: string; slug: string }): TrailItem {
  return link("case", activeCase.name, {
    to: "/cases/$caseSlug",
    params: { caseSlug: activeCase.slug },
  });
}

function withCase(
  activeCase: { name: string; slug: string } | null,
  rest: TrailItem[]
): TrailItem[] {
  if (!activeCase) return rest;
  return [caseCrumb(activeCase), ...rest];
}

function buildDashboardTrail(): TrailItem[] {
  return [current("dashboard", "Dashboard")];
}

function buildCasesTrail(input: PageTrailInput, segs: string[]): TrailItem[] {
  const next = segs[1];
  if (next === undefined) {
    return [current("cases", "Cases")];
  }
  const name = input.routeCase?.name ?? next;
  return [link("cases", "Cases", { to: "/cases" }), current("case", name)];
}

function buildEntitiesTrail(
  input: PageTrailInput,
  segs: string[]
): TrailItem[] {
  const next = segs[1];
  if (next === undefined) {
    return withCase(input.activeCase, [current("entities", "Entities")]);
  }
  const entityName = input.entity?.name ?? next;
  return withCase(input.activeCase, [
    link("entities", "Entities", { to: "/entities" }),
    current("entity", entityName),
  ]);
}

function buildCaseScopedTrail(
  input: PageTrailInput,
  id: string,
  label: string
): TrailItem[] {
  return withCase(input.activeCase, [current(id, label)]);
}

type TrailBuilder = (input: PageTrailInput, segs: string[]) => TrailItem[];

const TRAIL_BUILDERS: Record<string, TrailBuilder> = {
  "": () => buildDashboardTrail(),
  cases: buildCasesTrail,
  entities: buildEntitiesTrail,
  identifiers: (input) =>
    buildCaseScopedTrail(input, "identifiers", "Identifiers"),
  graph: (input) => buildCaseScopedTrail(input, "graph", "Graph"),
  collect: (input) => buildCaseScopedTrail(input, "collect", "Collect"),
  triage: (input) => buildCaseScopedTrail(input, "triage", "Triage"),
  tasks: (input) => buildCaseScopedTrail(input, "tasks", "Tasks"),
  settings: () => [current("settings", "Settings")],
  ui: () => [current("ui", "Style guide")],
};

/**
 * Last item is the current page. Case crumbs come from Active Case, not the Work URL.
 */
export function buildPageTrail(input: PageTrailInput): TrailItem[] {
  const segs = pathSegments(input.pathname);
  const head = segs[0] ?? "";
  const builder = TRAIL_BUILDERS[head];
  if (builder) return builder(input, segs);
  return [current("unknown", "Watchdog")];
}
