import { PlayIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  CollectRunModeToggle,
  type CollectRunMode,
} from "@/domains/collect/components/collect-run-mode-toggle";
import { Button } from "@/shared/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

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
        render={<Button type="button" size="lg" variant="outline" />}
      >
        <PlayIcon data-icon="inline-start" />
        Run
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(32rem,calc(100vw-2rem))]">
        <PopoverHeader>
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle>Run Cap or Playbook</PopoverTitle>
            <CollectRunModeToggle
              value={runMode}
              onValueChange={onRunModeChange}
            />
          </div>
          <PopoverDescription>
            {runMode === "playbook"
              ? "Playbook: curated Cap chain from a saved recipe."
              : "Cap: one capability against a target or seed."}
          </PopoverDescription>
        </PopoverHeader>
        <div className="[&_form]:w-full [&_form]:justify-start [&>div]:max-w-none [&>div]:items-stretch">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
