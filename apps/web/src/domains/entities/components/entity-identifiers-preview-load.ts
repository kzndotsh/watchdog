import { memoizeImport, prefetchImport } from "@/shared/lib/preload-import";

/** The expanded Entities table row's chunk: loaded on the first expand, warmed on intent. */
export const loadEntityIdentifiersPreview = memoizeImport(
  async () => import("@/domains/entities/components/entity-identifiers-preview")
);

/** Pointer enter or focus on a row's expand button. */
export function warmEntityIdentifiersPreview(): void {
  void prefetchImport(loadEntityIdentifiersPreview);
}
