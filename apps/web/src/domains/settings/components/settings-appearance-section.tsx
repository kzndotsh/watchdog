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
import { Field, FieldLabel } from "@watchdog/ui/components/field";
import { Label } from "@watchdog/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@watchdog/ui/components/radio-group";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@watchdog/ui/components/toggle-group";

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
export function SettingsAppearanceSection() {
  const { mode, setMode } = useThemeMode();
  const { scale, setScale } = useDisplayScale();

  return (
    <div className="max-w-2xl space-y-8">
      <FormSection
        title="Theme"
        description="Pick light or dark, or follow your system."
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
            className="grid sm:grid-cols-3"
          >
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <Label
                  key={option.value}
                  // oxlint-disable-next-line shadcn/no-restyle -- radio card: the label is the whole hit target, so it owns border, hover and checked chrome
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
        description="Make text and spacing larger or smaller."
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
                className="min-w-0 flex-1"
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
