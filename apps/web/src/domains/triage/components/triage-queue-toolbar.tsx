import {
  EMPTY_TRIAGE_FILTERS,
  STATUS_FACET_OPTIONS,
  type TriageQueueFilters,
} from "@/domains/triage/lib/filters";
import {
  PageFilterMenu,
  type PageFilterChip,
} from "@/shared/layout/page-filter-menu";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import { QueueFilterBar } from "@/shared/ui/queue-filter-bar";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Label } from "@/shared/ui/shadcn/label";

interface TriageQueueToolbarProps {
  filters: TriageQueueFilters;
  onFiltersChange: (next: TriageQueueFilters) => void;
  pendingCount?: number;
}

export function TriageQueueToolbar({
  filters,
  onFiltersChange,
  pendingCount,
}: TriageQueueToolbarProps) {
  const filterChips: PageFilterChip[] = filters.statuses.map((status) => ({
    id: `status:${status}`,
    label:
      STATUS_FACET_OPTIONS.find((o) => o.value === status)?.label ?? status,
    onClear: () => {
      onFiltersChange({
        ...filters,
        statuses: filters.statuses.filter((s) => s !== status),
      });
    },
  }));

  return (
    <PageToolbar
      center={
        <>
          <QueueFilterBar
            value={filters.q}
            onValueChange={(q) => {
              onFiltersChange({ ...filters, q });
            }}
            placeholder="Search summary, capability, id…"
            aria-label="Search proposals"
          />
          <PageFilterMenu
            chips={filterChips}
            onClearAll={() => {
              onFiltersChange({ ...EMPTY_TRIAGE_FILTERS, q: filters.q });
            }}
            contentClassName="w-[16rem]"
          >
            <div className="space-y-2">
              <Label>
                Status
                {pendingCount !== undefined && pendingCount > 0 ? (
                  <span className="text-label-mono-sm text-muted-foreground ml-1">
                    ({pendingCount} pending)
                  </span>
                ) : null}
              </Label>
              <div className="flex flex-col gap-2">
                {STATUS_FACET_OPTIONS.map((opt) => {
                  const checked = filters.statuses.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          onFiltersChange({
                            ...filters,
                            statuses: value
                              ? [...filters.statuses, opt.value]
                              : filters.statuses.filter((s) => s !== opt.value),
                          });
                        }}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </PageFilterMenu>
        </>
      }
    />
  );
}
