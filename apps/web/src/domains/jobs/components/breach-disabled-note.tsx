import {
  BREACH_CAPS_DOCS_URL,
  BREACH_CAPS_SETTING,
  BREACH_ENABLE_MEANING,
} from "@/domains/jobs/lib/breach-disabled";

/** What enabling the breach Caps means and how: the setting's name and a link to the docs. */
export function BreachDisabledNote() {
  return (
    <p
      className="text-muted-foreground text-xs leading-snug text-pretty"
      data-slot="breach-disabled-note"
    >
      {BREACH_ENABLE_MEANING} An operator turns them on with{" "}
      <code className="font-mono">{BREACH_CAPS_SETTING}</code>.{" "}
      <a
        href={BREACH_CAPS_DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        Read what enabling means
      </a>
    </p>
  );
}
