import { memoizeImport, prefetchImport } from "@/shared/lib/preload-import";

export const loadIdentifierComposerRow = memoizeImport(
  async () => import("@/shared/ui/identifiers/identifier-composer-row")
);

/** Pointer enter or focus on a control that opens the composer. */
export function warmComposer(): void {
  void prefetchImport(loadIdentifierComposerRow);
}
