import { loadIdentifierComposerRow } from "@/shared/ui/identifiers/identifier-composer-load";
import { loadEvidenceChecklist } from "@/shared/ui/intake/evidence-checklist-load";
import {
  loadDisplayBody,
  loadFiltersBody,
} from "@/shared/ui/list/parts/load-popover-bodies";

/**
 * Every lazy chunk loader under `src/shared/` (each `export const x = memoizeImport(...)`), by
 * export name. `shared-lazy-chunks.test.ts` fails when a shared loader is missing here, so a new
 * lazy shared part cannot ship without its preload.
 */
export const SHARED_LAZY_LOADERS = {
  loadDisplayBody,
  loadEvidenceChecklist,
  loadFiltersBody,
  loadIdentifierComposerRow,
} as const;

/**
 * Load every shared lazy chunk (the list popovers, the Evidence picker's checklist, the
 * Identifier composer row) before a test opens one, so `findBy*` never races a cold chunk on a
 * loaded CI runner. Call it in `beforeAll` of every test file that renders a shared lazy part,
 * except the one testing the lazy path itself (`list-popovers-lazy.component.test.tsx`).
 *
 * @canonical `preloadSharedLazyChunks`: Shared lazy chunks in web tests (list popovers, the Evidence checklist, the Identifier composer row; `beforeAll` in every test file that renders one, so `findBy*` never races a cold chunk; `shared-lazy-chunks.test.ts` fails on a shared `memoizeImport` loader it misses)
 */
export async function preloadSharedLazyChunks(): Promise<void> {
  await Promise.all(
    Object.values(SHARED_LAZY_LOADERS).map(async (load) => load())
  );
}
