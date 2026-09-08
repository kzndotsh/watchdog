import type { KeyboardEvent } from "react";

import { entityMatchesQuery } from "@/domains/entities/lib/entity-options";
import { cn } from "@/lib/utils";
import { CONTROL_CELL_SHELL, CONTROL_HEIGHT } from "@/shared/ui/control-chrome";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/shared/ui/shadcn/combobox";
import { EntityKindIcon } from "@/shared/ui/vocab";
import type { EntityKind } from "@watchdog/schemas";
import { entityDisplayLabel, trimmedOrUndefined } from "@watchdog/schemas";

export interface EntityOption {
  id: string;
  name: string;
  kind?: EntityKind;
  slug?: string;
}

interface SelectOption {
  value: string;
  label: string;
  kind?: EntityKind;
}

/**
 * Filterable entity picker. Domain chrome over Combobox — options are passed in
 * (parent owns fetch / case scoping). No I/O here.
 * Shares dense CONTROL_* chrome with SearchField / Select.
 */
export function EntityCombobox({
  entities,
  value,
  onValueChange,
  emptyLabel = "No entity",
  placeholder,
  allowEmpty = true,
  hideWhenEmpty = false,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Entity",
  "aria-invalid": ariaInvalid,
  size = "default",
  variant = "default",
  autoFocus = false,
  showClear,
  onKeyDown,
}: {
  entities: readonly EntityOption[];
  value: string;
  onValueChange: (id: string) => void;
  emptyLabel?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  /** Return null when there are no entities (Jobs attach). */
  hideWhenEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** Width density only — height matches CONTROL_HEIGHT either way. Ignored for `cell`. */
  size?: "default" | "sm";
  /** `cell` = ghost table-composer chrome (matches EditableSelectCell). */
  variant?: "default" | "cell";
  autoFocus?: boolean;
  /** Override clear (X). Default: shown when `allowEmpty` and a value is set. */
  showClear?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  if (hideWhenEmpty && entities.length === 0) {
    return null;
  }

  const emptyOpt: SelectOption = { value: "", label: emptyLabel };
  const options: SelectOption[] = [
    ...(allowEmpty ? [emptyOpt] : []),
    ...entities.map((ent) => ({
      value: ent.id,
      label: entityDisplayLabel({
        name: ent.name,
        slug: ent.slug ?? "",
      }),
      kind: ent.kind,
    })),
  ];

  const scopedValue = trimmedOrUndefined(value) ?? "";

  const selected =
    scopedValue === ""
      ? null
      : (options.find((o) => o.value === scopedValue) ?? null);

  return (
    <Combobox
      value={selected}
      items={options}
      itemToStringLabel={(opt) => opt.label}
      disabled={disabled}
      filter={(item, query) => {
        if (!item || item.value === "") {
          const q = query.trim().toLowerCase();
          return q === "" || emptyLabel.toLowerCase().includes(q);
        }
        const entity = entities.find((ent) => ent.id === item.value);
        return entity ? entityMatchesQuery(entity, query) : true;
      }}
      onValueChange={(next, details) => {
        if (details.reason === "escape-key") {
          details.allowPropagation();
        }
        const resolved = next?.value ?? "";
        if (!allowEmpty && !next) return;
        onValueChange(resolved);
      }}
    >
      <ComboboxInput
        showTrigger
        showClear={showClear ?? (allowEmpty && Boolean(scopedValue))}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        placeholder={placeholder ?? emptyLabel}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        className={cn(
          variant === "cell"
            ? CONTROL_CELL_SHELL
            : [
                CONTROL_HEIGHT,
                "shrink-0 [&_[data-slot=input-group-control]]:text-xs",
                size === "default" && "w-48",
                size === "sm" && "min-w-[10rem] flex-1",
              ],
          className
        )}
      />
      <ComboboxContent>
        <ComboboxEmpty>No entities.</ComboboxEmpty>
        <ComboboxList>
          {(opt: SelectOption) => (
            <ComboboxItem
              key={opt.value === "" ? "__empty" : opt.value}
              value={opt}
            >
              {opt.kind === undefined ? (
                opt.label
              ) : (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <EntityKindIcon kind={opt.kind} size="sm" />
                  <span className="truncate">{opt.label}</span>
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
