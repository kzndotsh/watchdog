import { Button } from "@/shared/ui/primitives/button";
import {
  normalizeScopes,
  SCOPE_PRESETS,
  SCOPES,
  type Scope,
  type ScopePresetId,
} from "@watchdog/schemas/shared";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@watchdog/ui/components/field";
import { Switch } from "@watchdog/ui/components/switch";

import { PRESET_COPY, SCOPE_COPY } from "./scope-copy";

const PRESET_IDS = [
  "agent",
  "collector",
  "full",
] as const satisfies readonly ScopePresetId[];

export interface ScopePickerProps {
  value: readonly Scope[];
  onChange: (scopes: Scope[]) => void;
  disabled?: boolean;
}

function sameScopes(a: readonly Scope[], b: readonly Scope[]): boolean {
  const left = normalizeScopes(a);
  const right = normalizeScopes(b);
  return left.length === right.length && left.every((s, i) => s === right[i]);
}

/** Presets (Agent, Collector, Full) and one switch per scope. `cases:read` is always on. */
export function ScopePicker({ value, onChange, disabled }: ScopePickerProps) {
  const toggle = (scope: Scope, on: boolean) => {
    const next = on
      ? [...value, scope]
      : value.filter((held) => held !== scope);
    onChange(normalizeScopes(next));
  };

  return (
    <FieldSet>
      <FieldLegend variant="label">What this key may do</FieldLegend>

      <div className="flex flex-wrap gap-2">
        {PRESET_IDS.map((id) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={
              sameScopes(value, SCOPE_PRESETS[id]) ? "default" : "outline"
            }
            aria-pressed={sameScopes(value, SCOPE_PRESETS[id])}
            title={PRESET_COPY[id].description}
            disabled={disabled}
            onClick={() => {
              onChange(normalizeScopes(SCOPE_PRESETS[id]));
            }}
          >
            {PRESET_COPY[id].label}
          </Button>
        ))}
      </div>

      {SCOPES.map((scope) => (
        <Field key={scope} orientation="horizontal">
          <div className="flex min-w-0 flex-col gap-0.5">
            <FieldLabel htmlFor={`api-key-scope-${scope.replace(":", "-")}`}>
              {SCOPE_COPY[scope].label}
            </FieldLabel>
            <FieldDescription>{SCOPE_COPY[scope].description}</FieldDescription>
          </div>
          <Switch
            id={`api-key-scope-${scope.replace(":", "-")}`}
            checked={value.includes(scope)}
            disabled={disabled === true || scope === "cases:read"}
            onCheckedChange={(checked) => {
              toggle(scope, checked);
            }}
          />
        </Field>
      ))}
    </FieldSet>
  );
}
