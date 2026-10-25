import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { MetricTilesSkeletonLayout } from "@/shared/ui/skeletons/dashboard/metric-tiles-skeleton-layout";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Skeleton } from "@watchdog/ui/components/skeleton";
import { Switch } from "@watchdog/ui/components/switch";
import { Textarea } from "@watchdog/ui/components/textarea";

type GhostSizedSkeletonProps = {
  children: ReactNode;
  className?: string;
  skeletonClassName?: string;
};

/** Overlay skeleton on invisible chrome so box model matches the real control. */
function GhostSizedSkeleton({
  children,
  className,
  skeletonClassName,
}: GhostSizedSkeletonProps) {
  return (
    <div className={cn("relative", className)}>
      <div className="pointer-events-none invisible" aria-hidden>
        {children}
      </div>
      <Skeleton
        className={cn("absolute inset-0 rounded-md", skeletonClassName)}
        aria-hidden
      />
    </div>
  );
}

/** Case settings sidebar — same Field stack as CaseSettingsForm. */
function CaseSettingsSkeleton() {
  return (
    <section
      className="border-border flex flex-col gap-3 rounded-md border p-3"
      aria-hidden
    >
      <h2 className="text-muted-foreground relative w-fit text-sm leading-tight font-medium">
        <span className="invisible">Case settings</span>
        <Skeleton className="absolute inset-0 rounded-md" aria-hidden />
      </h2>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel className="relative w-fit">
            <span className="invisible">Name</span>
            <Skeleton className="absolute inset-0 rounded-md" aria-hidden />
          </FieldLabel>
          <GhostSizedSkeleton>
            <Input disabled readOnly tabIndex={-1} defaultValue="" />
          </GhostSizedSkeleton>
        </Field>
        <Field>
          <FieldLabel className="relative w-fit">
            <span className="invisible">Description</span>
            <Skeleton className="absolute inset-0 rounded-md" aria-hidden />
          </FieldLabel>
          <GhostSizedSkeleton>
            <Textarea
              disabled
              readOnly
              rows={3}
              tabIndex={-1}
              defaultValue=""
            />
          </GhostSizedSkeleton>
        </Field>
        <Field orientation="horizontal">
          <GhostSizedSkeleton
            className="shrink-0"
            skeletonClassName="rounded-full"
          >
            <Switch disabled tabIndex={-1} checked={false} />
          </GhostSizedSkeleton>
          <FieldContent>
            <FieldLabel className="relative w-fit">
              <span className="invisible">Allowed egress</span>
              <Skeleton className="absolute inset-0 rounded-md" aria-hidden />
            </FieldLabel>
            <GhostSizedSkeleton>
              <FieldDescription>
                Allow Caps that call external services.
              </FieldDescription>
            </GhostSizedSkeleton>
          </FieldContent>
        </Field>
      </FieldGroup>
    </section>
  );
}

/** Case overview layout — mirrors CaseOverviewTab. */
export function CaseOverviewSkeletonLayout() {
  return (
    <div className="flex flex-col gap-6">
      <MetricTilesSkeletonLayout />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,22rem)]">
        <section className="min-w-0">
          <Skeleton className="mb-2 h-4 w-28" />
          <div className="ml-2 flex flex-col gap-3 pl-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </section>
        <CaseSettingsSkeleton />
      </div>
    </div>
  );
}
