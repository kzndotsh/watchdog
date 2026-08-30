import { KEYS } from "platejs";
import { useEditorRef, useEditorSelector } from "platejs/react";

import {
  RichTextHeadingToggleGroup,
  RichTextListButtons,
  RichTextMarkToggleGroup,
} from "@/shared/ui/rich-text/rich-text-toolbar-controls";
import {
  activeHeading,
  activeMarks,
  preventToolbarMouseDown,
} from "@/shared/ui/rich-text/rich-text-toolbar-controls.lib";

export function RichTextToolbar() {
  const editor = useEditorRef();
  const isH1 = useEditorSelector(
    (ed) => ed.api.some({ match: { type: KEYS.h1 } }),
    []
  );
  const isH2 = useEditorSelector(
    (ed) => ed.api.some({ match: { type: KEYS.h2 } }),
    []
  );
  const isH3 = useEditorSelector(
    (ed) => ed.api.some({ match: { type: KEYS.h3 } }),
    []
  );
  const isBold = useEditorSelector(
    (ed) => ed.api.some({ match: { [KEYS.bold]: true } }),
    []
  );
  const isItalic = useEditorSelector(
    (ed) => ed.api.some({ match: { [KEYS.italic]: true } }),
    []
  );
  const isUnderline = useEditorSelector(
    (ed) => ed.api.some({ match: { [KEYS.underline]: true } }),
    []
  );

  return (
    <div
      role="toolbar"
      tabIndex={-1}
      aria-label="Formatting"
      className="border-border bg-muted/30 flex min-h-9 flex-nowrap items-center gap-1 overflow-x-auto border-b px-1 py-1"
      onMouseDown={preventToolbarMouseDown}
    >
      <RichTextHeadingToggleGroup
        editor={editor}
        headingValue={activeHeading(isH1, isH2, isH3)}
        isH1={isH1}
        isH2={isH2}
        isH3={isH3}
      />
      <RichTextMarkToggleGroup
        editor={editor}
        markValue={activeMarks(isBold, isItalic, isUnderline)}
        isBold={isBold}
        isItalic={isItalic}
        isUnderline={isUnderline}
      />
      <RichTextListButtons editor={editor} />
    </div>
  );
}
