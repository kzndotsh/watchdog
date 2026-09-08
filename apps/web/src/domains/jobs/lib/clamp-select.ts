/**
 * If `current` is missing from `optionIds`, return the first option id.
 * Used to clamp Cap/Playbook select fields when the option list changes.
 *
 * When `allowEmpty` is true: empty string is preserved, and an invalid
 * selection clears to `""` instead of jumping to the first option.
 */
export function clampSelectId(
  current: string,
  optionIds: readonly string[],
  opts?: { allowEmpty?: boolean }
): string | null {
  const allowEmpty = opts?.allowEmpty === true;
  const scoped = current.trim();
  if (allowEmpty && scoped === "") return "";
  if (optionIds.length === 0) return allowEmpty ? "" : null;
  if (optionIds.includes(scoped)) return scoped;
  if (allowEmpty) return "";
  return optionIds[0] ?? null;
}
