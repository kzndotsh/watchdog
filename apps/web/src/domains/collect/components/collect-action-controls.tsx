import {
  ClipboardPasteIcon,
  FileUpIcon,
  LinkIcon,
  PlayIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { DumpModal } from "@/domains/intake/components/dump-dialogs";
import { Button } from "@/shared/ui/shadcn/button";
import { ButtonGroup } from "@/shared/ui/shadcn/button-group";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/shared/ui/shadcn/popover";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/shadcn/toggle-group";

const RUN_MODES = [
  { value: "cap", label: "Cap" },
  { value: "playbook", label: "Playbook" },
] as const;

export type CollectRunMode = (typeof RUN_MODES)[number]["value"];

function isRunMode(value: string | undefined): value is CollectRunMode {
  return RUN_MODES.some((mode) => mode.value === value);
}

export function CollectRunModeToggle({
  value,
  onValueChange,
}: {
  value: CollectRunMode;
  onValueChange: (next: CollectRunMode) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Run mode"
      spacing={1}
      value={[value]}
      onValueChange={(next: string[]) => {
        const mode = next[0];
        if (isRunMode(mode)) onValueChange(mode);
      }}
      className="bg-muted h-7 rounded-lg p-0.5"
    >
      {RUN_MODES.map((mode) => (
        <ToggleGroupItem
          key={mode.value}
          value={mode.value}
          size="sm"
          className="text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground h-6 px-2.5 text-xs aria-pressed:shadow-sm"
        >
          {mode.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function CollectDumpButtons({
  disabled,
  onDump,
}: {
  disabled?: boolean;
  onDump: (kind: DumpModal) => void;
}) {
  return (
    <ButtonGroup aria-label="Dump evidence">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 text-xs"
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
        size="sm"
        variant="outline"
        className="h-8 text-xs"
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
        size="sm"
        variant="outline"
        className="h-8 text-xs"
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

export function CollectRunPopover({
  runMode,
  onRunModeChange,
  children,
}: {
  runMode: CollectRunMode;
  onRunModeChange: (next: CollectRunMode) => void;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" size="sm" className="h-8 text-xs" />}
      >
        <PlayIcon data-icon="inline-start" />
        Run cap/playbook
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(32rem,calc(100vw-2rem))] gap-3 p-3"
      >
        <PopoverHeader className="gap-2">
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle>Run Cap or Playbook</PopoverTitle>
            <CollectRunModeToggle
              value={runMode}
              onValueChange={onRunModeChange}
            />
          </div>
          <PopoverDescription>
            {runMode === "playbook"
              ? "Chain Caps from a saved playbook recipe."
              : "Run one capability against a target or seed."}
          </PopoverDescription>
        </PopoverHeader>
        <div className="[&_form]:w-full [&_form]:justify-start [&>div]:max-w-none [&>div]:items-stretch">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
