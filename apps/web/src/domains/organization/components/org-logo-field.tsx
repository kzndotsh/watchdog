import { Camera, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import {
  logoFileProblem,
  orgInitials,
  resizeLogoToDataUrl,
} from "@/domains/organization/lib/org-logo";
import { errMessage } from "@/lib/utils";
import { Button } from "@/shared/ui/primitives/button";
import { Field, FieldError } from "@watchdog/ui/components/field";
import { Label } from "@watchdog/ui/components/label";

/**
 * Pick or clear an organization logo. Same layout as the account avatar: a large clickable
 * picture, a hint, and Upload / Delete. The image is cropped square and shrunk before it is stored.
 */
export function OrgLogoField({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    const rejected = logoFileProblem(file);
    if (rejected !== null) {
      setProblem(rejected);
      return;
    }
    try {
      onChange(await resizeLogoToDataUrl(file));
      setProblem(null);
    } catch (error) {
      setProblem(errMessage(error, "Couldn't read the image"));
    }
  }

  return (
    <Field>
      <Label>Logo</Label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          className="group focus-visible:ring-ring/50 relative size-24 shrink-0 rounded-full outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          aria-label="Change logo"
        >
          <span className="bg-muted text-muted-foreground flex size-24 items-center justify-center overflow-hidden rounded-full text-2xl font-medium">
            {value ? (
              <img src={value} alt="" className="size-full object-cover" />
            ) : (
              orgInitials(name || "Organization")
            )}
          </span>
          <span className="bg-background/80 text-foreground absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-5" />
          </span>
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            Square images work best. Click the picture to change it.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Upload
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || !value}
              onClick={() => {
                onChange(null);
              }}
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          </div>
        </div>
      </div>
      <FieldError>{problem}</FieldError>
    </Field>
  );
}
