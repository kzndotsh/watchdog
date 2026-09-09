import {
  GuideSection,
  Specimen,
  Swatch,
} from "@/routes/_protected/ui/-guide-chrome";
import { TypeScaleSpecimen } from "@/routes/_protected/ui/type-scale-specimen";

const CONFIDENCE_SWATCHES = [
  { name: "confirmed", className: "bg-confidence-confirmed" },
  { name: "possible", className: "bg-confidence-possible" },
  { name: "unverified", className: "bg-confidence-unverified" },
] as const;

const STATUS_SWATCHES = [
  { name: "queued", className: "bg-status-queued" },
  { name: "running", className: "bg-status-running" },
  { name: "succeeded", className: "bg-status-succeeded" },
  { name: "failed", className: "bg-status-failed" },
  { name: "cancelled", className: "bg-status-cancelled" },
  { name: "pending", className: "bg-status-pending" },
  { name: "accepted", className: "bg-status-accepted" },
  { name: "rejected", className: "bg-status-rejected" },
  { name: "current", className: "bg-status-current" },
  { name: "former", className: "bg-status-former" },
  { name: "unknown", className: "bg-status-unknown" },
  { name: "contested", className: "bg-status-contested" },
  { name: "retracted", className: "bg-status-retracted" },
  { name: "disproved", className: "bg-status-disproved" },
] as const;

const KIND_SWATCHES = [
  { name: "person", className: "bg-kind-person" },
  { name: "org", className: "bg-kind-org" },
  { name: "infra", className: "bg-kind-infra" },
  { name: "email", className: "bg-kind-email" },
  { name: "handle", className: "bg-kind-handle" },
  { name: "phone", className: "bg-kind-phone" },
  { name: "crypto", className: "bg-kind-crypto" },
  { name: "pgp", className: "bg-kind-pgp" },
  { name: "url", className: "bg-kind-url" },
  { name: "domain", className: "bg-kind-domain" },
  { name: "ip", className: "bg-kind-ip" },
  { name: "credential", className: "bg-kind-credential" },
  { name: "file", className: "bg-kind-file" },
  { name: "url_archive", className: "bg-kind-url_archive" },
  { name: "attestation", className: "bg-kind-attestation" },
  { name: "observation", className: "bg-kind-observation" },
  { name: "assessment", className: "bg-kind-assessment" },
  { name: "allegation", className: "bg-kind-allegation" },
  { name: "other", className: "bg-kind-other" },
] as const;

const SEMANTIC_SWATCHES = [
  { name: "success", className: "bg-success" },
  { name: "warning", className: "bg-warning" },
  { name: "destructive", className: "bg-destructive" },
  { name: "signal", className: "bg-signal" },
  { name: "muted", className: "bg-muted" },
  { name: "primary", className: "bg-primary" },
] as const;

export function FoundationsSection() {
  return (
    <GuideSection
      id="foundations"
      title="Foundations"
      blurb="Semantic tokens and type roles from styles.css. Prefer these utilities over freestyle palette classes."
    >
      <Specimen label="Semantic">
        {SEMANTIC_SWATCHES.map((s) => (
          <Swatch key={s.name} name={s.name} className={s.className} />
        ))}
      </Specimen>

      <Specimen label="Confidence">
        {CONFIDENCE_SWATCHES.map((s) => (
          <Swatch key={s.name} name={s.name} className={s.className} />
        ))}
      </Specimen>

      <Specimen label="Status">
        {STATUS_SWATCHES.map((s) => (
          <Swatch key={s.name} name={s.name} className={s.className} />
        ))}
      </Specimen>

      <Specimen label="Kind">
        {KIND_SWATCHES.map((s) => (
          <Swatch key={s.name} name={s.name} className={s.className} />
        ))}
      </Specimen>

      <Specimen
        label="Type scale"
        blurb="All wd-typography roles with live rem, px, and line-height from computed styles."
        className="md:col-span-2"
      >
        <TypeScaleSpecimen className="w-full" />
      </Specimen>
    </GuideSection>
  );
}
