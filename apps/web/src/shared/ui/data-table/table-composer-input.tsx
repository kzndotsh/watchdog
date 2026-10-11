import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@watchdog/ui/components/input";

const TABLE_COMPOSER_INPUT_CLASS =
  "h-7 w-full rounded-md border-transparent bg-transparent px-1.5 py-0 text-xs shadow-none focus-visible:bg-background/60 focus-visible:border-transparent focus-visible:!shadow-none focus-visible:!ring-0 focus-visible:outline-none";

export function TableComposerInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input className={cn(TABLE_COMPOSER_INPUT_CLASS, className)} {...props} />
  );
}
