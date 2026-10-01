import {
  evaluatePasswordStrength,
  type PasswordStrengthLevel,
} from "@better-auth-ui/core";
import { useAuth } from "@better-auth-ui/react";

import { cn } from "@/lib/utils";

/** Fixed segment identities, so the bars keep their own React keys. */
const STRENGTH_SEGMENTS = [1, 2, 3, 4] as const;

type FilledLevel = Exclude<PasswordStrengthLevel, "empty">;

const segmentColors: Record<FilledLevel, string> = {
  weak: "bg-destructive",
  fair: "bg-signal",
  good: "bg-accent",
  strong: "bg-success",
};

/**
 * Four-segment strength hint under a new-password field. A hint only: it never gates
 * submission (server password rules decide) and renders nothing while the field is empty
 * or `emailAndPassword.strengthMeter` is off.
 */
export function PasswordStrengthMeter({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  const { emailAndPassword, localization } = useAuth();

  if (!emailAndPassword?.strengthMeter) return null;

  const { score, level } = evaluatePasswordStrength(password, {
    minLength: emailAndPassword.minPasswordLength,
  });

  if (level === "empty") return null;

  const levelLabels: Record<FilledLevel, string> = {
    weak: localization.auth.passwordWeak,
    fair: localization.auth.passwordFair,
    good: localization.auth.passwordGood,
    strong: localization.auth.passwordStrong,
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* Decorative: the live region below is what gets announced. */}
      <div aria-hidden="true" className="flex gap-1">
        {STRENGTH_SEGMENTS.map((segment) => (
          <span
            key={segment}
            className={cn(
              "bg-muted h-1 flex-1 rounded-full transition-colors",
              segment <= score && segmentColors[level]
            )}
          />
        ))}
      </div>

      <p aria-live="polite" className="text-muted-foreground text-xs">
        {localization.auth.passwordStrength}:{" "}
        <span className="text-foreground">{levelLabels[level]}</span>
      </p>
    </div>
  );
}
