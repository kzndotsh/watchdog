import { lazy, Suspense } from "react";

import { preloadRichTextEditor } from "@/shared/ui/rich-text/load-rich-text-editor";
import type { RichTextEditorProps } from "@/shared/ui/rich-text/rich-text-editor";
import { RichTextEditorSkeleton } from "@/shared/ui/skeletons";

const LoadedRichTextEditor = lazy(async () => {
  const mod = await preloadRichTextEditor();
  return { default: mod.RichTextEditor };
});

/**
 * The rich-text editor behind a lazy boundary: the Plate chunk (about 280 KB gzip) loads on
 * first render or on `preloadRichTextEditor()`, not with the route. Same props as the real
 * editor; while the chunk loads an editor-shaped skeleton shows through the show-delay.
 */
export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense
      fallback={
        <RichTextEditorSkeleton
          variant={props.variant}
          toolbar={props.toolbar}
          shouldFill={props.shouldFill}
          className={props.className}
        />
      }
    >
      <LoadedRichTextEditor {...props} />
    </Suspense>
  );
}
