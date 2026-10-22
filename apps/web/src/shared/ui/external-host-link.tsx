import { ArrowUpRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { urlHost } from "@/shared/lib/url-host";

type ExternalHostLinkProps = {
  href: string;
  className?: string;
};

/** External link that shows only the hostname (the full URL is its title), for a narrow column. */
export function ExternalHostLink({ href, className }: ExternalHostLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      className={cn(
        "text-primary inline-flex max-w-full items-center gap-1 hover:underline",
        className
      )}
    >
      <span className="truncate">{urlHost(href)}</span>
      <ArrowUpRightIcon aria-hidden className="size-3.5 shrink-0" />
    </a>
  );
}
