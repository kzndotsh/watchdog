import { Link } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type {
  CountOnTrailId,
  TrailItem,
  TrailTo,
} from "@/shared/layout/page-trail";
import { usePageTrail } from "@/shared/layout/use-page-trail";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/ui/shadcn/breadcrumb";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";
import { TabCount } from "@/shared/ui/tab-count";

function CaseGlyph() {
  return (
    <FolderIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
  );
}

function CrumbFace({ item }: { item: TrailItem }) {
  if (item.id !== "case") return item.label;
  return (
    <>
      <CaseGlyph />
      <span className="truncate">{item.label}</span>
    </>
  );
}

function TrailLink({ item, href }: { item: TrailItem; href: TrailTo }) {
  const className =
    "text-muted-foreground hover:text-foreground inline-flex max-w-[12rem] min-w-0 items-center gap-1 text-sm";
  const ariaLabel = item.id === "case" ? `Case ${item.label}` : undefined;
  const face = <CrumbFace item={item} />;

  switch (href.to) {
    case "/cases/$caseSlug": {
      return (
        <BreadcrumbLink
          aria-label={ariaLabel}
          className={className}
          render={<Link to="/cases/$caseSlug" params={href.params} />}
        >
          {face}
        </BreadcrumbLink>
      );
    }
    case "/":
    case "/cases":
    case "/entities":
    case "/identifiers":
    case "/graph":
    case "/collect":
    case "/triage":
    case "/tasks":
    case "/settings":
    case "/ui": {
      return (
        <BreadcrumbLink
          aria-label={ariaLabel}
          className={className}
          render={<Link to={href.to} />}
        >
          {face}
        </BreadcrumbLink>
      );
    }
    default: {
      const _exhaustive: never = href;
      return _exhaustive;
    }
  }
}

function LastCrumb({
  current,
  pendingLast,
  placeholderLast,
  errorLast,
  item,
}: {
  current?: ReactNode;
  pendingLast: boolean;
  placeholderLast: boolean;
  errorLast: boolean;
  item: TrailItem;
}) {
  if (current === undefined) {
    if (pendingLast) {
      return <Skeleton className="h-3 w-24" />;
    }
    return (
      <BreadcrumbPage
        aria-label={item.id === "case" ? `Case ${item.label}` : undefined}
        className={cn(
          "text-foreground inline-flex max-w-[16rem] min-w-0 items-center gap-1 text-sm font-semibold tracking-tight",
          placeholderDeemphasisClass(placeholderLast),
          errorLast && "text-destructive"
        )}
      >
        <CrumbFace item={item} />
      </BreadcrumbPage>
    );
  }
  return (
    <span
      aria-current="page"
      className="text-foreground inline-flex min-w-0 items-center gap-2 font-semibold tracking-tight"
    >
      {current}
    </span>
  );
}

export function AppBreadcrumbs({
  current,
  count,
  countOn,
}: {
  current?: ReactNode;
  count?: number;
  countOn?: CountOnTrailId;
}) {
  const { items, pendingLast, placeholderLast, errorLast } = usePageTrail();
  const last = items.at(-1);
  const ancestors = items.slice(0, -1);

  if (!last) return null;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="text-muted-foreground flex-nowrap gap-1 text-sm">
        {ancestors.map((item) => (
          <Fragment key={item.id}>
            <BreadcrumbItem className="min-w-0">
              {item.href ? (
                <TrailLink item={item} href={item.href} />
              ) : (
                <span className="text-muted-foreground inline-flex max-w-[12rem] min-w-0 items-center gap-1">
                  <CrumbFace item={item} />
                </span>
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator className="[&>svg]:size-3" />
          </Fragment>
        ))}
        <BreadcrumbItem className="min-w-0">
          <LastCrumb
            current={current}
            pendingLast={pendingLast}
            placeholderLast={placeholderLast}
            errorLast={errorLast}
            item={last}
          />
          {count !== undefined && countOn === last.id ? (
            <TabCount n={count} />
          ) : null}
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
