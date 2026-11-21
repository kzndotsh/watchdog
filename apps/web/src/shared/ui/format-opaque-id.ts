/**
 * String form for option labels / aria — prefer IdChip in JSX.
 *
 * @canonical `formatOpaqueId`: Opaque id text
 */
export function formatOpaqueId(value: string, head = 8, tail = 0): string {
  if (value.length <= head + tail + 1) return value;
  if (tail <= 0) return `${value.slice(0, head)}…`;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
