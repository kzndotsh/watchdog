import { useId } from "react";

import { isLibraryFiltered } from "@/domains/library/lib/library-filters";
import { READINESS_LABELS } from "@/domains/library/lib/library-readiness";
import {
  COMMERCIAL_USE_VALUES,
  EMPTY_LIBRARY_FILTERS,
  LIBRARY_READINESS_STATES,
  type InputKindOption,
  type LibraryFilters,
} from "@/domains/library/types";
import {
  PageFilterMenu,
  type PageFilterChip,
} from "@/shared/layout/page-filter-menu";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import { FieldSelect } from "@/shared/ui/field-select";
import { QueueFilterBar } from "@/shared/ui/queue-filter-bar";
import { Checkbox } from "@watchdog/ui/components/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@watchdog/ui/components/field";

const ANY_INPUT = "";

const COMMERCIAL_LABELS: Record<
  (typeof COMMERCIAL_USE_VALUES)[number],
  string
> = {
  allowed: "Allowed",
  restricted: "Restricted",
  forbidden: "Forbidden",
  unknown: "Unknown",
};

export type LibraryQueueToolbarProps = {
  filters: LibraryFilters;
  onFiltersChange: (next: LibraryFilters) => void;
  kindOptions: readonly InputKindOption[];
};

function toggled<T>(list: readonly T[], item: T, isOn: boolean): T[] {
  return isOn
    ? [...list.filter((existing) => existing !== item), item]
    : list.filter((existing) => existing !== item);
}

export function LibraryQueueToolbar({
  filters,
  onFiltersChange,
  kindOptions,
}: LibraryQueueToolbarProps) {
  const thirdPartyId = useId();

  const chips: PageFilterChip[] = [
    ...filters.readiness.map((state) => ({
      id: `readiness:${state}`,
      label: READINESS_LABELS[state],
      onClear: () => {
        onFiltersChange({
          ...filters,
          readiness: toggled(filters.readiness, state, false),
        });
      },
    })),
    ...(filters.isThirdPartyOnly
      ? [
          {
            id: "third-party",
            label: "Sends data to a third party",
            onClear: () => {
              onFiltersChange({ ...filters, isThirdPartyOnly: false });
            },
          },
        ]
      : []),
    ...filters.commercialUse.map((use) => ({
      id: `commercial:${use}`,
      label: `Commercial use: ${COMMERCIAL_LABELS[use]}`,
      onClear: () => {
        onFiltersChange({
          ...filters,
          commercialUse: toggled(filters.commercialUse, use, false),
        });
      },
    })),
  ];

  return (
    <PageToolbar
      center={
        <>
          <FieldSelect
            aria-label="Start from what you have"
            className="w-56"
            value={filters.inputKind ?? ANY_INPUT}
            placeholder="Start from what you have"
            options={[
              { value: ANY_INPUT, label: "Anything" },
              ...kindOptions.map((opt) => ({
                value: opt.value,
                label: `${opt.label} (${opt.count})`,
              })),
            ]}
            onValueChange={(next) => {
              onFiltersChange({
                ...filters,
                inputKind: next === ANY_INPUT ? null : next,
              });
            }}
          />
          <QueueFilterBar
            value={filters.q}
            onValueChange={(q) => {
              onFiltersChange({ ...filters, q });
            }}
            placeholder="Search the Library…"
            aria-label="Search the Library"
            hasActiveFilters={isLibraryFiltered(filters)}
            onReset={() => {
              onFiltersChange(EMPTY_LIBRARY_FILTERS);
            }}
          />
          <PageFilterMenu
            chips={chips}
            onClearAll={() => {
              onFiltersChange({
                ...filters,
                readiness: [],
                isThirdPartyOnly: false,
                commercialUse: [],
              });
            }}
            contentClassName="max-h-[70vh] overflow-y-auto"
          >
            <div className="space-y-3">
              <FieldSet>
                <FieldLegend variant="label">Readiness</FieldLegend>
                <FieldGroup>
                  {LIBRARY_READINESS_STATES.map((state) => {
                    const id = `library-readiness-${state}`;
                    return (
                      <Field key={state} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={filters.readiness.includes(state)}
                          onCheckedChange={(value) => {
                            onFiltersChange({
                              ...filters,
                              readiness: toggled(
                                filters.readiness,
                                state,

                                value
                              ),
                            });
                          }}
                        />
                        <FieldLabel htmlFor={id}>
                          {READINESS_LABELS[state]}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Data</FieldLegend>
                <FieldGroup>
                  <Field orientation="horizontal">
                    <Checkbox
                      id={thirdPartyId}
                      checked={filters.isThirdPartyOnly}
                      onCheckedChange={(value) => {
                        onFiltersChange({
                          ...filters,
                          isThirdPartyOnly: value,
                        });
                      }}
                    />
                    <FieldLabel htmlFor={thirdPartyId}>
                      Sends data to a third party
                    </FieldLabel>
                  </Field>
                </FieldGroup>
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">
                  Provider commercial use
                </FieldLegend>
                <FieldGroup>
                  {COMMERCIAL_USE_VALUES.map((use) => {
                    const id = `library-commercial-${use}`;
                    return (
                      <Field key={use} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={filters.commercialUse.includes(use)}
                          onCheckedChange={(value) => {
                            onFiltersChange({
                              ...filters,
                              commercialUse: toggled(
                                filters.commercialUse,
                                use,

                                value
                              ),
                            });
                          }}
                        />
                        <FieldLabel htmlFor={id}>
                          {COMMERCIAL_LABELS[use]}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
            </div>
          </PageFilterMenu>
        </>
      }
    />
  );
}
