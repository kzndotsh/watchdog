import { BoldIcon, ItalicIcon, UnderlineIcon } from "lucide-react";
import type { PlateEditor } from "platejs/react";

import {
  applyMarkChange,
  type MarkValue,
} from "@/shared/ui/rich-text/rich-text-toolbar-controls.lib";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@watchdog/ui/components/toggle-group";

export function RichTextMarkToggleGroup({
  editor,
  markValue,
  isBold,
  isItalic,
  isUnderline,
}: {
  editor: PlateEditor;
  markValue: MarkValue[];
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
}) {
  return (
    <ToggleGroup
      multiple
      variant="outline"
      size="sm"
      spacing={0}
      value={markValue}
      onValueChange={(next: string[]) => {
        applyMarkChange(editor, next, isBold, isItalic, isUnderline);
      }}
      aria-label="Text style"
    >
      <ToggleGroupItem value="bold" aria-label="Bold" title="Bold">
        <BoldIcon data-icon="inline-start" />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic" title="Italic">
        <ItalicIcon data-icon="inline-start" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="underline"
        aria-label="Underline"
        title="Underline"
      >
        <UnderlineIcon data-icon="inline-start" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
