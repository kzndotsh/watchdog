import { cn } from "@/lib/utils";

/** Subtle de-emphasis while `placeholderData: keepPreviousData` serves stale rows. */
export function placeholderDeemphasisClass(
  isPlaceholderData?: boolean
): string {
  return cn(
    "transition-opacity duration-150",
    isPlaceholderData ? "opacity-60" : undefined
  );
}
