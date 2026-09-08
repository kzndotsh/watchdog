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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/shadcn/field";

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
            <FieldSet className="gap-3 border-0 p-0">
              <FieldLegend variant="label">
                Status
                {pendingCount !== undefined && pendingCount > 0 ? (
                  <span className="text-label-mono-sm text-muted-foreground ml-1">
                    ({pendingCount} pending)
                  </span>
                ) : null}
              </FieldLegend>
              <FieldGroup className="gap-2">
                {STATUS_FACET_OPTIONS.map((opt) => {
                  const checked = filters.statuses.includes(opt.value);
                  const id = `triage-status-${opt.value}`;
                  return (
                    <Field key={opt.value} orientation="horizontal">
                      <Checkbox
                        id={id}
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
                      <FieldLabel htmlFor={id}>{opt.label}</FieldLabel>
                    </Field>
                  );
                })}
              </FieldGroup>
            </FieldSet>
          </PageFilterMenu>
        </>
      }
    />
  );
}
