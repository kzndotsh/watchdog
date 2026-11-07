import { createContext, useContext } from "react";

import type { TrailItem } from "@/shared/layout/page-trail";

/** What the breadcrumbs draw: the trail plus how its last crumb is loading. */
export type PageTrailState = {
  items: TrailItem[];
  isPendingLast: boolean;
  isPlaceholderLast: boolean;
  isErrorLast: boolean;
};

const EMPTY_TRAIL: PageTrailState = {
  items: [],
  isPendingLast: false,
  isPlaceholderLast: false,
  isErrorLast: false,
};

/**
 * The page trail, provided by the app shell (`app/layout/page-trail-provider.tsx`), which
 * alone knows which domain reads name an Entity or a Library entry. Shared chrome reads it
 * here so it imports no domain; outside the provider the trail is empty.
 */
export const PageTrailContext = createContext<PageTrailState>(EMPTY_TRAIL);

export function useCurrentPageTrail(): PageTrailState {
  return useContext(PageTrailContext);
}
