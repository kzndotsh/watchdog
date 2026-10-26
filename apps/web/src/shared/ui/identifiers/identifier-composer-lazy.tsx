import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";

import { loadIdentifierComposerRow } from "@/shared/ui/identifiers/identifier-composer-load";

const LoadedComposerAppend = lazy(async () => {
  const { IdentifierComposerAppend } = await loadIdentifierComposerRow();
  return { default: IdentifierComposerAppend };
});

type LazyComposerProps = ComponentProps<typeof LoadedComposerAppend> & {
  /** What the table shows for the one frame the chunk is loading (its add row). */
  readonly fallback: ReactNode;
};

/**
 * The composer row's chunk (the Entity and Evidence pickers, the combobox and select it uses)
 * loads when a table first opens its composer, and on `warmComposer()`. The form hook and
 * defaults stay in `identifier-composer.tsx`. `fallback` is what the table shows for the one
 * frame the chunk is loading (its add row).
 */
export function LazyIdentifierComposerAppend({
  fallback,
  ...props
}: LazyComposerProps) {
  return (
    <Suspense fallback={fallback}>
      <LoadedComposerAppend {...props} />
    </Suspense>
  );
}
