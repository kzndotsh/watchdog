import { ArrowRightIcon } from "lucide-react";

/** The arrow between flow boxes: down when they stack on a phone, right beside each other. */
export function LibraryFlowArrow() {
  return (
    <div className="text-muted-foreground flex items-center justify-center">
      <ArrowRightIcon aria-hidden className="size-3.5 rotate-90 md:rotate-0" />
    </div>
  );
}
