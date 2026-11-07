import type { ReactNode } from "react";

import { usePageTrail } from "@/app/layout/use-page-trail";
import { PageTrailContext } from "@/shared/layout/page-trail-context";

/** Resolves the page trail once (route, Case, Entity and Library reads) for the breadcrumbs below. */
export function PageTrailProvider({ children }: { children: ReactNode }) {
  return <PageTrailContext value={usePageTrail()}>{children}</PageTrailContext>;
}
