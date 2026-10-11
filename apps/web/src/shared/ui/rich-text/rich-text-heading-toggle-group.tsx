import { Heading1Icon, Heading2Icon, Heading3Icon } from "lucide-react";
import type { PlateEditor } from "platejs/react";

import {
  applyHeadingChange,
  type HeadingValue,
} from "@/shared/ui/rich-text/rich-text-toolbar-controls.lib";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@watchdog/ui/components/toggle-group";

export function RichTextHeadingToggleGroup({
  editor,
  headingValue,
  isH1,
  isH2,
  isH3,
}: {
  editor: PlateEditor;
  headingValue: HeadingValue[];
  isH1: boolean;
  isH2: boolean;
  isH3: boolean;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={headingValue}
      onValueChange={(next: string[]) => {
        applyHeadingChange(editor, next, isH1, isH2, isH3);
      }}
      aria-label="Headings"
    >
      <ToggleGroupItem value="h1" aria-label="Heading 1" title="Heading 1">
        <Heading1Icon data-icon="inline-start" />
      </ToggleGroupItem>
      <ToggleGroupItem value="h2" aria-label="Heading 2" title="Heading 2">
        <Heading2Icon data-icon="inline-start" />
      </ToggleGroupItem>
      <ToggleGroupItem value="h3" aria-label="Heading 3" title="Heading 3">
        <Heading3Icon data-icon="inline-start" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
