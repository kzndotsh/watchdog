export type TrailTo =
  | { to: "/" }
  | { to: "/cases" }
  | { to: "/cases/$caseSlug"; params: { caseSlug: string } }
  | { to: "/entities" }
  | { to: "/identifiers" }
  | { to: "/graph" }
  | { to: "/collect" }
  | { to: "/triage" }
  | { to: "/tasks" }
  | { to: "/settings" }
  | { to: "/ui" };

export interface TrailItem {
  id: string;
  label: string;
  href?: TrailTo;
}

/** Last-crumb ids that may show `PageHeader count`. */
export type CountOnTrailId = "entities" | "identifiers" | "tasks";

export interface PageTrailInput {
  pathname: string;
  activeCase: { name: string; slug: string } | null;
  /** Case named by `/cases/$caseSlug` (may differ from Active Case). */
  routeCase: { name: string; slug: string } | null;
  entity: { name: string } | null;
}
