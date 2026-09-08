import type { ReactNode } from "react";
import { useId } from "react";

import {
  applyCollectFilterToggle,
  isCollectFiltered,
} from "@/domains/collect/lib/collect-filters";
import {
  COLLECT_STATE_FACET_OPTIONS,
  EMPTY_COLLECT_FILTERS,
  type CollectFilters,
  type CollectState,
} from "@/domains/collect/types";
import { capabilityFacetOptions } from "@/domains/jobs/lib/status";
import type { JobListRecord } from "@/domains/jobs/types";
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

export interface CollectQueueToolbarProps {
  filters: CollectFilters;
  onFiltersChange: (next: CollectFilters) => void;
  jobs: readonly JobListRecord[];
  actions?: ReactNode;
}

export function CollectQueueToolbar({
  filters,
  onFiltersChange,
  jobs,
  actions,
}: CollectQueueToolbarProps) {
  const hiddenOnlyId = useId();
  const unprocessedOnlyId = useId();
  const unattachedOnlyId = useId();
  const capOptions = capabilityFacetOptions([...jobs]);
  const selectedCapabilityIds = new Set(filters.capabilityIds);

  const filterChips: PageFilterChip[] = [
    ...(filters.hiddenOnly
      ? [
          {
            id: "hidden",
            label: "Hidden",
            onClear: () => {
              onFiltersChange({ ...filters, hiddenOnly: false });
            },
          },
        ]
      : []),
    ...(filters.unprocessedOnly
      ? [
          {
            id: "unprocessed-only",
            label: "Unprocessed",
            onClear: () => {
              onFiltersChange({ ...filters, unprocessedOnly: false });
            },
          },
        ]
      : []),
    ...(filters.unattachedOnly
      ? [
          {
            id: "unattached-only",
            label: "Unattached",
            onClear: () => {
              onFiltersChange({ ...filters, unattachedOnly: false });
            },
          },
        ]
      : []),
    ...filters.states.map((state) => ({
      id: state,
      label:
        COLLECT_STATE_FACET_OPTIONS.find((opt) => opt.value === state)?.label ??
        state,
      onClear: () => {
        onFiltersChange({
          ...filters,
          states: filters.states.filter((item: CollectState) => item !== state),
        });
      },
    })),
    ...filters.capabilityIds.map((id) => ({
      id: `cap:${id}`,
      label: capOptions.find((opt) => opt.value === id)?.label ?? id,
      onClear: () => {
        onFiltersChange({
          ...filters,
          capabilityIds: filters.capabilityIds.filter((capId) => capId !== id),
        });
      },
    })),
  ];

  return (
    <PageToolbar
      center={
        <>
          <QueueFilterBar
            value={filters.q}
            onValueChange={(q) => {
              onFiltersChange({ ...filters, q });
            }}
            placeholder="Search items…"
            aria-label="Search items"
            filtersActive={isCollectFiltered(filters)}
            onReset={() => {
              onFiltersChange(EMPTY_COLLECT_FILTERS);
            }}
          />
          <PageFilterMenu
            chips={filterChips}
            onClearAll={() => {
              onFiltersChange({ ...EMPTY_COLLECT_FILTERS, q: filters.q });
            }}
            contentClassName="w-[16rem]"
          >
            <div className="space-y-3">
              <FieldSet className="gap-3 border-0 p-0">
                <FieldLegend variant="label">Show only</FieldLegend>
                <FieldGroup className="gap-2">
                  <Field orientation="horizontal">
                    <Checkbox
                      id={hiddenOnlyId}
                      checked={filters.hiddenOnly}
                      onCheckedChange={(value) => {
                        onFiltersChange(
                          applyCollectFilterToggle(filters, "hiddenOnly", value)
                        );
                      }}
                    />
                    <FieldLabel htmlFor={hiddenOnlyId}>Hidden</FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <Checkbox
                      id={unprocessedOnlyId}
                      checked={filters.unprocessedOnly}
                      onCheckedChange={(value) => {
                        onFiltersChange(
                          applyCollectFilterToggle(
                            filters,
                            "unprocessedOnly",
                            value
                          )
                        );
                      }}
                    />
                    <FieldLabel htmlFor={unprocessedOnlyId}>
                      Unprocessed
                    </FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <Checkbox
                      id={unattachedOnlyId}
                      checked={filters.unattachedOnly}
                      onCheckedChange={(value) => {
                        onFiltersChange(
                          applyCollectFilterToggle(
                            filters,
                            "unattachedOnly",
                            value
                          )
                        );
                      }}
                    />
                    <FieldLabel htmlFor={unattachedOnlyId}>
                      Unattached
                    </FieldLabel>
                  </Field>
                </FieldGroup>
              </FieldSet>
              <FieldSet className="gap-3 border-0 p-0">
                <FieldLegend variant="label">State</FieldLegend>
                <FieldGroup className="gap-2">
                  {COLLECT_STATE_FACET_OPTIONS.map((opt) => {
                    const checked = filters.states.includes(opt.value);
                    const id = `collect-state-${opt.value}`;
                    return (
                      <Field key={opt.value} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(value) => {
                            onFiltersChange({
                              ...filters,
                              states: value
                                ? [...filters.states, opt.value]
                                : filters.states.filter(
                                    (state) => state !== opt.value
                                  ),
                            });
                          }}
                        />
                        <FieldLabel htmlFor={id}>{opt.label}</FieldLabel>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
              {capOptions.length > 0 ? (
                <FieldSet className="gap-3 border-0 p-0">
                  <FieldLegend variant="label">Cap / playbook</FieldLegend>
                  <FieldGroup className="max-h-40 gap-2 overflow-y-auto">
                    {capOptions.map((opt) => {
                      const checked = selectedCapabilityIds.has(opt.value);
                      const id = `collect-cap-${opt.value}`;
                      return (
                        <Field key={opt.value} orientation="horizontal">
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={(value) => {
                              onFiltersChange({
                                ...filters,
                                capabilityIds: value
                                  ? [...filters.capabilityIds, opt.value]
                                  : filters.capabilityIds.filter(
                                      (capId) => capId !== opt.value
                                    ),
                              });
                            }}
                          />
                          <FieldLabel htmlFor={id} className="truncate text-xs">
                            {opt.label}
                          </FieldLabel>
                        </Field>
                      );
                    })}
                  </FieldGroup>
                </FieldSet>
              ) : null}
            </div>
          </PageFilterMenu>
        </>
      }
      trailing={
        actions ? (
          <div className="flex shrink-0 items-stretch gap-2">{actions}</div>
        ) : null
      }
    />
  );
}
