import { ListIcon, ListOrderedIcon } from "lucide-react";
import { KEYS } from "platejs";
import type { PlateEditor } from "platejs/react";
import { useEditorSelector } from "platejs/react";

import {
  activeList,
  applyListChange,
} from "@/shared/ui/rich-text/rich-text-toolbar-controls.lib";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@watchdog/ui/components/toggle-group";

export function RichTextListButtons({ editor }: { editor: PlateEditor }) {
  const isUl = useEditorSelector(
    (ed) => ed.api.some({ match: { type: KEYS.ul } }),
    []
  );
  const isOl = useEditorSelector(
    (ed) => ed.api.some({ match: { type: KEYS.ol } }),
    []
  );

  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={activeList(isUl, isOl)}
      onValueChange={(next: string[]) => {
        applyListChange(editor, next, isUl, isOl);
      }}
      aria-label="Lists"
    >
      <ToggleGroupItem
        value="ul"
        aria-label="Bulleted list"
        title="Bulleted list"
      >
        <ListIcon data-icon="inline-start" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="ol"
        aria-label="Numbered list"
        title="Numbered list"
      >
        <ListOrderedIcon data-icon="inline-start" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
