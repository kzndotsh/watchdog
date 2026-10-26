import { memoizeImport, prefetchImport } from "@/shared/lib/preload-import";

/** The Connections popover's fields: the server-searched peer picker and relationship combobox. */
export const loadConnectionComposerFields = memoizeImport(
  async () => import("@/domains/entities/components/connection-composer-fields")
);

/** Pointer enter or focus on a row's Connections cell. */
export function warmConnectionComposerFields(): void {
  void prefetchImport(loadConnectionComposerFields);
}
