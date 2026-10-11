import { cn } from "@/lib/utils";
import { CHIP_SIZE_CLASS } from "@/shared/ui/chip";

export const EVIDENCE_PICKER_TRIGGER_CLASS = cn(
  CHIP_SIZE_CLASS.sm,
  "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-border/60 focus-visible:ring-ring/50 inline-flex cursor-pointer items-center bg-transparent transition-colors outline-none focus-visible:ring-2"
);
