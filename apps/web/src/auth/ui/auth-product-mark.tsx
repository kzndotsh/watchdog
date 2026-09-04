import { DogIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Shared product mark for auth surfaces (sign-in, sign-up, reset, …). */
export function AuthProductMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col items-center gap-2 text-center",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <DogIcon className="size-6 shrink-0" aria-hidden />
        <span className="font-heading text-lg font-bold tracking-widest">
          WATCHDOG
        </span>
      </div>
      <p className="text-muted-foreground max-w-xs text-sm leading-snug">
        Case Graph under human custody
      </p>
    </div>
  );
}
