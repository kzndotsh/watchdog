/**
 * A field of the input an oRPC query key carries (`[path, { input, type }]`), or `undefined` when
 * the key is not a procedure key or its input lacks the field. Placeholder rules use it to keep a
 * previous answer only within the same scope (the same Case, the same Entity).
 */
export function orpcKeyInputField(
  queryKey: readonly unknown[] | undefined,
  field: string
): unknown {
  const options: unknown = queryKey?.[1];
  if (typeof options !== "object" || options === null) return undefined;
  const input: unknown = Reflect.get(options, "input");
  if (typeof input !== "object" || input === null) return undefined;
  return Reflect.get(input, field);
}
