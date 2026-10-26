import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import type { AnyFilterSource } from "@/shared/lib/list/list-types";
import { FieldSelect } from "@/shared/ui/field-select";
import { FilterChoicesControl } from "@/shared/ui/list/parts/filter-choices-control";
import { FilterFlagControl } from "@/shared/ui/list/parts/filter-flag-control";
import { FilterRefControl } from "@/shared/ui/list/parts/filter-ref-control";
import { FilterTagsControl } from "@/shared/ui/list/parts/filter-tags-control";
import { Button } from "@/shared/ui/primitives/button";
import type { AnyFilter } from "@watchdog/schemas/shared";

type ListFilterRowProps = {
  /** The field select's options: this row's filter plus every filter without a row. */
  readonly fields: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly fieldKey: string;
  readonly filter: AnyFilter;
  /** The canonical value (`false`, `null` or `[]` while the row is a draft). */
  readonly value: unknown;
  /** The screen's options for a `ref` or `tags` filter. */
  readonly source: AnyFilterSource | undefined;
  /** Move focus to the value control (the row's filter was just picked). */
  readonly shouldFocusValue: boolean;
  readonly onFieldChange: (key: string) => void;
  readonly onValueChange: (value: unknown) => void;
  readonly onRemove: () => void;
};

const FOCUSABLE = "button, input, [role='switch'], [role='combobox']";

function stringsOf(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** The value control of one filter kind (one exhaustive switch, as in every interpreter). */
function FilterValueControl({
  filter,
  value,
  source,
  onValueChange,
}: Pick<ListFilterRowProps, "filter" | "value" | "source" | "onValueChange">) {
  switch (filter.kind) {
    case "flag": {
      return (
        <FilterFlagControl
          filter={filter}
          isOn={value === true}
          onValueChange={onValueChange}
        />
      );
    }
    case "choices": {
      return (
        <FilterChoicesControl
          filter={filter}
          value={stringsOf(value)}
          onValueChange={onValueChange}
        />
      );
    }
    case "ref": {
      return source?.kind === "ref" ? (
        <FilterRefControl
          filter={filter}
          value={typeof value === "string" ? value : null}
          source={source}
          onValueChange={onValueChange}
        />
      ) : null;
    }
    case "tags": {
      return source?.kind === "tags" ? (
        <FilterTagsControl
          filter={filter}
          value={stringsOf(value)}
          source={source}
          onValueChange={onValueChange}
        />
      ) : null;
    }
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

/**
 * One Filters popover row: the filter's name (a select of the filters not in another row), its
 * value control by kind (`flag` a switch, `choices` a multi-select, `ref` the screen's searched
 * picker, `tags` a typed multi-pick) and a named remove button. No operators. Picking another
 * filter moves focus to the new value control. Escape inside an open picker closes only the
 * picker (Base UI closes the innermost popup); the next Escape closes the popover.
 */
export function ListFilterRow({
  fields,
  fieldKey,
  filter,
  value,
  source,
  shouldFocusValue,
  onFieldChange,
  onValueChange,
  onRemove,
}: ListFilterRowProps) {
  const valueRef = useRef<HTMLDivElement>(null);
  // Focus is DOM work: after the row's filter changes, its new value control takes focus.
  useEffect(() => {
    if (!shouldFocusValue) return;
    const target = valueRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
  }, [shouldFocusValue, fieldKey]);

  return (
    <div
      data-slot="list-filter-row"
      className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-1.5"
    >
      <FieldSelect
        value={fieldKey}
        options={fields}
        aria-label="Filter"
        onValueChange={onFieldChange}
      />
      <div ref={valueRef} className="min-w-0">
        <FilterValueControl
          filter={filter}
          value={value}
          source={source}
          onValueChange={onValueChange}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label={`Remove ${filter.label} filter`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </div>
  );
}
