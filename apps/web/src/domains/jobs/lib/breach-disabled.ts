/** The operator setting that turns the breach Caps on (`packages/env`). */
export const BREACH_CAPS_SETTING = "WD_ENABLE_BREACH_CAPS";

/** Where an operator reads what enabling the breach Caps means. */
export const BREACH_CAPS_DOCS_URL =
  "https://github.com/kzndotsh/watchdog/blob/main/docs/reference/platform/caps-lexicon.md#breach-caps-are-opt-in";

/** One line for a disabled row in a Cap or Playbook list. */
export const BREACH_DISABLED_ROW_TEXT = `Off — set ${BREACH_CAPS_SETTING} to enable`;

/** What enabling means, for the note beside a disabled breach Cap. */
export const BREACH_ENABLE_MEANING =
  "Breach Caps query breach and leak corpora about people. Enabling them makes you responsible for a lawful basis and for each provider's terms.";

/** The run gate's reason when a breach Cap or Playbook is selected while the setting is off. */
export function breachDisabledReason(subject: "Cap" | "playbook"): string {
  return `Can't run this ${subject}: breach Caps are off. An operator enables them with ${BREACH_CAPS_SETTING}`;
}

/** Whether a catalog entry is disabled by the operator's breach setting. */
export function isBreachDisabled(
  entry: { disabledReason?: "breach_disabled" } | undefined
): boolean {
  return entry?.disabledReason === "breach_disabled";
}
