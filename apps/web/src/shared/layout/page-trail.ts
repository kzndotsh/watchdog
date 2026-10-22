import { WORK_TO, type WorkScreen } from "@/config/nav";
import {
  capCategory,
  categoryLabel,
  PLAYBOOK_CATEGORY,
} from "@/shared/lib/cap-category";
import { entityDisplayLabel } from "@watchdog/schemas/shared";

import type { PageTrailInput, TrailItem } from "./page-trail.types";

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

function link(id: string, label: string, href: TrailItem["href"]): TrailItem {
  return { id, label, href };
}

const SCREEN_LABEL: Record<WorkScreen, string> = {
  entities: "Entities",
  identifiers: "Identifiers",
  graph: "Graph",
  collect: "Collect",
  triage: "Triage",
  tasks: "Tasks",
};

function isWorkScreen(segment: string): segment is WorkScreen {
  return Object.hasOwn(WORK_TO, segment);
}

function buildDashboardTrail(): TrailItem[] {
  return [current("dashboard", "Dashboard")];
}

/** `/cases`, `/cases/$slug` (Overview) and `/cases/$slug/$screen[/$entity]` (Work). */
function buildCasesTrail(input: PageTrailInput, segs: string[]): TrailItem[] {
  const slug = segs[1];
  if (slug === undefined) {
    return [current("cases", "Cases")];
  }
  const caseLabel = input.routeCase?.name ?? slug;
  const screen = segs[2];
  if (screen === undefined || !isWorkScreen(screen)) {
    return [
      link("cases", "Cases", { to: "/cases" }),
      current("case", caseLabel),
    ];
  }

  const caseCrumb = link("case", caseLabel, {
    to: "/cases/$caseSlug",
    params: { caseSlug: slug },
  });
  const entitySegment = segs[3];
  if (screen !== "entities" || entitySegment === undefined) {
    return [caseCrumb, current(screen, SCREEN_LABEL[screen])];
  }
  const entityName =
    input.entity === null
      ? entitySegment
      : entityDisplayLabel({
          name: input.entity.name,
          slug: input.entity.slug,
        });
  return [
    caseCrumb,
    link("entities", SCREEN_LABEL.entities, {
      to: WORK_TO.entities,
      params: { caseSlug: slug },
    }),
    current("entity", entityName),
  ];
}

/**
 * `/library`, and an entry's page under it: "Library / Network / Shodan lookup". The category
 * comes from the URL (a Cap's id, or Playbooks) and opens the Library on it; the title shows the
 * id until the catalog loads.
 */
function buildLibraryTrail(input: PageTrailInput, segs: string[]): TrailItem[] {
  const id = segs[2];
  if ((segs[1] !== "caps" && segs[1] !== "playbooks") || id === undefined) {
    return [current("library", "Library")];
  }
  const category = segs[1] === "caps" ? capCategory(id) : PLAYBOOK_CATEGORY;
  return [
    link("library", "Library", { to: "/library" }),
    link("library-category", categoryLabel(category), {
      to: "/library",
      search: { cat: category },
    }),
    current("library-entry", input.libraryEntry?.title ?? id),
  ];
}

type TrailBuilder = (input: PageTrailInput, segs: string[]) => TrailItem[];

const TRAIL_BUILDERS: Record<string, TrailBuilder> = {
  "": () => buildDashboardTrail(),
  cases: buildCasesTrail,
  "deleted-cases": () => [
    link("cases", "Cases", { to: "/cases" }),
    current("deleted-cases", "Deleted Cases"),
  ],
  library: buildLibraryTrail,
  settings: () => [current("settings", "Settings")],
  ui: () => [current("ui", "Style guide")],
};

/**
 * Last item is the current page. The Case crumb comes from the Case in the URL
 * (`/cases/$caseSlug/...`), never from the cookie.
 */
export function buildPageTrail(input: PageTrailInput): TrailItem[] {
  const segs = pathSegments(input.pathname);
  const head = segs[0] ?? "";
  const builder = TRAIL_BUILDERS[head];
  if (builder) return builder(input, segs);
  return [current("unknown", "Watchdog")];
}
