import type { SlugAvailability } from "@/domains/organization/lib/use-slug-availability";
import { cn } from "@/lib/utils";
import { Field, FieldLabel } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";

const STATUS_TEXT: Record<SlugAvailability, string | null> = {
  idle: null,
  checking: "Checking…",
  available: "That name is free",
  taken: "That name is already in use",
};

/** URL-name input with a live availability line under it. */
export function OrgSlugField({
  id,
  value,
  onChange,
  availability,
  placeholder,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  availability: SlugAvailability;
  placeholder?: string;
  disabled?: boolean;
}) {
  const status = STATUS_TEXT[availability];
  return (
    <Field data-invalid={availability === "taken" || undefined}>
      <FieldLabel htmlFor={id}>Short name</FieldLabel>
      <Input
        id={id}
        className="font-mono"
        placeholder={placeholder}
        value={value}
        aria-invalid={availability === "taken" || undefined}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <p
        aria-live="polite"
        className={cn(
          "text-xs",
          availability === "taken"
            ? "text-destructive"
            : "text-muted-foreground"
        )}
      >
        {status ?? "Used in links. Lowercase letters, numbers, and dashes."}
      </p>
    </Field>
  );
}
