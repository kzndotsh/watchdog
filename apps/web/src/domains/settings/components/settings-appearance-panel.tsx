import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import {
  isThemeMode,
  modeLabel,
  useThemeMode,
} from "@/shared/layout/theme-toggle";
import {
  DISPLAY_SCALE_LABELS,
  DISPLAY_SCALE_PRESETS,
  isDisplayScaleValue,
  useDisplayScale,
} from "@/shared/lib/display-scale";
import { FormSection } from "@/shared/ui/form-section";
import { Field, FieldLabel } from "@/shared/ui/shadcn/field";
import { Label } from "@/shared/ui/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/shadcn/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/shadcn/toggle-group";

const THEME_OPTIONS: {
  value: "light" | "dark" | "auto";
  label: string;
  icon: typeof SunIcon;
}[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "auto", label: "System", icon: MonitorIcon },
];

/** Theme + display size preferences (localStorage). */
export function SettingsAppearancePanel() {
  const { mode, setMode } = useThemeMode();
  const { scale, setScale } = useDisplayScale();

  return (
    <div className="max-w-2xl space-y-8">
      <FormSection
        title="Theme"
        description="Choose light, dark, or match your system setting."
      >
        <Field>
          <FieldLabel>Color mode</FieldLabel>
          <RadioGroup
            value={mode}
            onValueChange={(next) => {
              if (isThemeMode(next)) {
                setMode(next);
              }
            }}
            className="grid gap-2 sm:grid-cols-3"
          >
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <Label
                  key={option.value}
                  className="border-input hover:bg-muted/60 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-muted/80 flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm"
                >
                  <RadioGroupItem value={option.value} />
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span>{option.label}</span>
                </Label>
              );
            })}
          </RadioGroup>
          <p className="text-muted-foreground text-xs">
            Current: {modeLabel(mode)}. You can also cycle theme from the
            sidebar user menu.
          </p>
        </Field>
      </FormSection>

      <FormSection
        title="Display size"
        description="Scale typography and spacing together. Browser zoom still works for larger sizes."
      >
        <Field>
          <FieldLabel>Size preset</FieldLabel>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[String(scale)]}
            onValueChange={(next) => {
              const raw = next.at(-1);
              if (raw === undefined) return;
              const parsed = Number(raw);
              if (isDisplayScaleValue(parsed)) {
                setScale(parsed);
              }
            }}
            aria-label="Display size"
            className="w-full max-w-md"
          >
            {DISPLAY_SCALE_PRESETS.map((preset) => (
              <ToggleGroupItem
                key={preset}
                value={String(preset)}
                className="min-w-0 flex-1 px-2"
              >
                {DISPLAY_SCALE_LABELS[preset]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </FormSection>
    </div>
  );
}
