import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { entityDisplayLabel, trimmedOrUndefined } from "@watchdog/schemas";

type NameSize = "sm" | "md";

const NAME_SIZE_CLASS: Record<NameSize, string> = {
  sm: "text-xs",
  md: "text-sm",
};

/** Inline entity name; pass `slug` to link to the dossier. */
export function EntityMention({
  name,
  slug,
  tab,
  size = "md",
  className,
  nameClassName,
  trailing,
}: {
  name: string;
  slug?: string;
  tab?: string;
  size?: NameSize;
  className?: string;
  nameClassName?: string;
  trailing?: ReactNode;
}) {
  const scopedSlug = trimmedOrUndefined(slug);
  const label =
    scopedSlug === undefined
      ? name.trim()
      : entityDisplayLabel({ name, slug: scopedSlug });

  const nameEl = (
    <span
      className={cn(
        "text-foreground min-w-0 truncate font-medium underline-offset-2",
        NAME_SIZE_CLASS[size],
        nameClassName
      )}
    >
      {label}
    </span>
  );

  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1",
        className
      )}
    >
      {scopedSlug ? (
        <Link
          to="/entities/$entitySlug"
          params={{ entitySlug: scopedSlug }}
          search={tab ? { tab } : undefined}
          className="hover:underline"
        >
          {nameEl}
        </Link>
      ) : (
        nameEl
      )}
      {trailing}
    </span>
  );
}
