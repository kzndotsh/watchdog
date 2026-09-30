/** A text field from `FormData`: the string value, or `""` when absent (or a file). */
export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
