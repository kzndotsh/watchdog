import type { ReactNode } from "react";
import { useId } from "react";

import { isCollectFiltered } from "@/domains/collect/lib/collect-filters";
import {
  COLLECT_STATE_FACET_OPTIONS,
  EMPTY_COLLECT_FILTERS,
  type CollectFilters,
  type CollectState,
} from "@/domains/collect/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { capabilityFacetOptions } from "@/domains/jobs/lib/status";
import {
  PageFilterMenu,
  type PageFilterChip,
} from "@/shared/layout/page-filter-menu";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import { QueueFilterBar } from "@/shared/ui/queue-filter-bar";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { FieldLabel } from "@/shared/ui/shadcn/field";
import { Label } from "@/shared/ui/shadcn/label";

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
              <div className="space-y-2">
                <Label>Show only</Label>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor={hiddenOnlyId}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={hiddenOnlyId}
                      checked={filters.hiddenOnly}
                      onCheckedChange={(value) => {
                        onFiltersChange({
                          ...filters,
                          hiddenOnly: value,
                        });
                      }}
                    />
                    <FieldLabel className="mb-0">Hidden</FieldLabel>
                  </label>
                  <label
                    htmlFor={unprocessedOnlyId}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={unprocessedOnlyId}
                      checked={filters.unprocessedOnly}
                      onCheckedChange={(value) => {
                        onFiltersChange({
                          ...filters,
                          unprocessedOnly: value,
                        });
                      }}
                    />
                    <FieldLabel className="mb-0">Unprocessed</FieldLabel>
                  </label>
                  <label
                    htmlFor={unattachedOnlyId}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={unattachedOnlyId}
                      checked={filters.unattachedOnly}
                      onCheckedChange={(value) => {
                        onFiltersChange({
                          ...filters,
                          unattachedOnly: value,
                        });
                      }}
                    />
                    <FieldLabel className="mb-0">Unattached</FieldLabel>
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <div className="flex flex-col gap-2">
                  {COLLECT_STATE_FACET_OPTIONS.map((opt) => {
                    const checked = filters.states.includes(opt.value);
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
                              states: value
                                ? [...filters.states, opt.value]
                                : filters.states.filter(
                                    (state) => state !== opt.value
                                  ),
                            });
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              {capOptions.length > 0 ? (
                <div className="space-y-2">
                  <Label>Capability</Label>
                  <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                    {capOptions.map((opt) => {
                      const checked = selectedCapabilityIds.has(opt.value);
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
                                capabilityIds: value
                                  ? [...filters.capabilityIds, opt.value]
                                  : filters.capabilityIds.filter(
                                      (capId) => capId !== opt.value
                                    ),
                              });
                            }}
                          />
                          <span className="font-mono text-xs">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
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
