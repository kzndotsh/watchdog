import { AtSignIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ChipSize = "sm" | "md";

const API_KEY_PREFIX = "api-key:";

function handleText(label: string): string {
  const trimmed = label.trim();
  if (trimmed.startsWith("@")) return trimmed.slice(1);
  return trimmed;
}

export function ActorMention({
  label,
  size = "md",
  prefix,
  className,
}: {
  label: string;
  size?: ChipSize;
  prefix?: string;
  className?: string;
}) {
  const trimmed = label.trim();
  if (trimmed === "") return null;
  const isApiKey = trimmed.startsWith(API_KEY_PREFIX);
  const handle = isApiKey ? trimmed : handleText(trimmed);
  if (handle === "") return null;
  const mention = isApiKey ? handle : `@${handle}`;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {prefix !== undefined && prefix !== "" ? (
        <span className="text-muted-foreground shrink-0 text-xs font-normal">
          {prefix}
        </span>
      ) : null}
      <span
        aria-label={mention}
        className="text-foreground/80 inline-flex max-w-[16rem] min-w-0 items-center gap-0.5 font-sans text-xs font-normal"
      >
        {isApiKey ? null : (
          <AtSignIcon
            aria-hidden
            className={cn("shrink-0", size === "sm" ? "size-2.5" : "size-3")}
            strokeWidth={2}
          />
        )}
        <span className="truncate">{handle}</span>
      </span>
    </span>
  );
}
