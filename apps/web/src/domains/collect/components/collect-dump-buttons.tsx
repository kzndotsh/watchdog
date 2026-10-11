import { ClipboardPasteIcon, FileUpIcon, LinkIcon } from "lucide-react";

import type { DumpModal } from "@/domains/intake/components/dump-dialogs";
import { Button } from "@/shared/ui/primitives/button";
import { ButtonGroup } from "@watchdog/ui/components/button-group";

export function CollectDumpButtons({
  disabled,
  onDump,
}: {
  disabled?: boolean;
  onDump: (kind: DumpModal) => void;
}) {
  return (
    <ButtonGroup
      aria-label="Dump evidence"
      // oxlint-disable-next-line shadcn/no-restyle -- ButtonGroup squares the last child's corner; this group ends in a rounded primary action
      className="[&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-md!"
    >
      <Button
        type="button"
        size="lg"
        variant="default"
        disabled={disabled}
        onClick={() => {
          onDump("file");
        }}
      >
        <FileUpIcon data-icon="inline-start" />
        File
      </Button>
      <Button
        type="button"
        size="lg"
        variant="default"
        disabled={disabled}
        onClick={() => {
          onDump("paste");
        }}
      >
        <ClipboardPasteIcon data-icon="inline-start" />
        Paste
      </Button>
      <Button
        type="button"
        size="lg"
        variant="default"
        disabled={disabled}
        onClick={() => {
          onDump("url");
        }}
      >
        <LinkIcon data-icon="inline-start" />
        URL
      </Button>
    </ButtonGroup>
  );
}
