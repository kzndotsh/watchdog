/** Adapters from TanStack Form field meta to shadcn's `Field` / `FieldError`. */
interface FieldMeta {
  isTouched: boolean;
  isValid: boolean;
  errors: readonly unknown[];
}

/** Invalid only after the field is touched or a submit attempt ran. */
export function fieldInvalid(meta: FieldMeta): boolean {
  return (meta.isTouched || meta.errors.length > 0) && !meta.isValid;
}

/** `FieldError` wants `{ message }[]`; validators here return plain strings. */
export function fieldErrorList(meta: FieldMeta): { message: string }[] {
  return meta.errors.flatMap((e) => {
    if (typeof e === "string") return [{ message: e }];
    if (e && typeof e === "object" && "message" in e) {
      return [{ message: String(e.message) }];
    }
    return [];
  });
}
