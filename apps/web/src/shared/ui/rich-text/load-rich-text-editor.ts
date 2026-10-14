import type { RichTextEditor } from "@/shared/ui/rich-text/rich-text-editor";

type EditorModule = { RichTextEditor: typeof RichTextEditor };

let editorModule: Promise<EditorModule> | undefined;

/**
 * Start (once) the dynamic import of the Plate editor chunk. `React.lazy` and the intent
 * handlers (pointer enter or focus of a control that opens an editor, or a screen that will
 * show one) share one underlying import, so the chunk is requested a single time. Call it from event
 * handlers and effects, never during render.
 */
export async function preloadRichTextEditor(): Promise<EditorModule> {
  editorModule ??= import("@/shared/ui/rich-text/rich-text-editor");
  return editorModule;
}
