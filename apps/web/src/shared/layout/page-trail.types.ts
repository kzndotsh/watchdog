import type { WORK_TO } from "@/config/nav";

export type TrailTo =
  | { to: "/" }
  | { to: "/cases" }
  | { to: "/cases/$caseSlug"; params: { caseSlug: string } }
  | { to: (typeof WORK_TO)[keyof typeof WORK_TO]; params: { caseSlug: string } }
  | { to: "/settings" }
  | { to: "/ui" };

export type TrailItem = {
  id: string;
  label: string;
  href?: TrailTo;
};

/** Last-crumb ids that may show `PageHeader count`. */
export type CountOnTrailId = "entities" | "identifiers" | "tasks";

export type PageTrailInput = {
  pathname: string;
  /** Case named by `/cases/$caseSlug/...` (every Work screen and the Overview). */
  routeCase: { name: string; slug: string } | null;
  entity: { name: string; slug: string } | null;
};
