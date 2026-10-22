import type { CapProviderInfo } from "@/domains/jobs/types";

type ProviderAttributionProps = {
  attribution: NonNullable<CapProviderInfo["attribution"]>;
};

/** The credit a provider's terms require, shown with the Cap's output. */
export function ProviderAttribution({ attribution }: ProviderAttributionProps) {
  return (
    <p className="text-muted-foreground text-xs">
      <a
        href={attribution.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        {attribution.text}
      </a>
    </p>
  );
}
