import { fieldErrorList, fieldInvalid } from "@/shared/lib/field-errors";
import { FieldError } from "@watchdog/ui/components/field";

type Meta = Parameters<typeof fieldInvalid>[0];

/** Validation message for a TanStack Form field; renders nothing while valid. */
export function FieldMessage({ meta }: { meta: Meta }) {
  return fieldInvalid(meta) ? (
    <FieldError errors={fieldErrorList(meta)} />
  ) : null;
}
