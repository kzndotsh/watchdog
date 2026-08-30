import { useMemo, useState, type ReactNode } from "react";

import { GuideSection, Specimen } from "@/routes/_protected/ui/-guide-chrome";
import { ActiveTabBody, SuspenseTabBody } from "@/shared/ui/active-tab-body";
import { ClickableIdChip } from "@/shared/ui/clickable-id-chip";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { ConfidenceSelect } from "@/shared/ui/confidence-select";
import { DetailEmpty } from "@/shared/ui/detail-empty";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { EmptyState } from "@/shared/ui/empty-state";
import { EntityCombobox } from "@/shared/ui/entity-combobox";
import { EntityMention } from "@/shared/ui/entity-mention";
import { ExternalUrl } from "@/shared/ui/external-url";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { FieldSelect } from "@/shared/ui/field-select";
import {
  FormInlineError,
  FormInlineWarning,
} from "@/shared/ui/form-inline-message";
import { IdChip } from "@/shared/ui/id-chip";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { QueueHeader } from "@/shared/ui/queue-header";
import { QueueRow, QueueRowMeta, QueueRowTitle } from "@/shared/ui/queue-row";
import { RelativeTime } from "@/shared/ui/relative-time";
import { RichTextEditor } from "@/shared/ui/rich-text";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { SearchField } from "@/shared/ui/search-field";
import { SectionLabel } from "@/shared/ui/section-label";
import { DropdownMenuItem } from "@/shared/ui/shadcn/dropdown-menu";
import { QueueSkeleton } from "@/shared/ui/skeletons";
import { SplitView } from "@/shared/ui/split-view";
import { StatusDot } from "@/shared/ui/status-dot";
import { TimelineDot, TimelineSpine } from "@/shared/ui/timeline-spine";
import { Timestamp } from "@/shared/ui/timestamp";
import {
  ClaimClassBadge,
  ConfidenceBadge,
  KindBadge,
  PatchOpBadge,
  StatusBadge,
} from "@/shared/ui/vocab";

const DEMO_EXTERNAL_HREF = ["https", "://example.com/evidence"].join("");
const SAMPLE_ID = "8680fa38-0c1d-4e2f-9a3b-595335c1d2e3";
const SAMPLE_SHA =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SAMPLE_AT = new Date(Date.now() - 86_400_000).toISOString();

interface AtomEntry {
  name: string;
  blurb: string;
  render: () => ReactNode;
}

const ATOM_CATALOG: AtomEntry[] = [
  {
    name: "IdChip",
    blurb: "Opaque ids/hashes — never .slice(0,N). Copyable = whole chip.",
    render: () => (
      <>
        <IdChip value={SAMPLE_ID} />
        <IdChip value={SAMPLE_ID} copyable />
        <IdChip value={SAMPLE_SHA} preset="sha256" copyable />
      </>
    ),
  },
  {
    name: "ClickableIdChip",
    blurb: "Preview affordance — eye glyph, opens evidence.",
    render: () => <ClickableIdChip value={SAMPLE_ID} />,
  },
  {
    name: "StatusDot",
    blurb: "Dense lifecycle color — prefer with StatusBadge for labels.",
    render: () => (
      <>
        <StatusDot status="succeeded" />
        <StatusDot status="running" pulse />
        <StatusDot status="failed" />
        <StatusDot status="queued" />
      </>
    ),
  },
  {
    name: "StatusBadge",
    blurb: "Job / proposal / retract / identifier status text.",
    render: () => (
      <>
        <StatusBadge status="succeeded" />
        <StatusBadge status="running" />
        <StatusBadge status="pending" />
        <StatusBadge status="accepted" />
        <StatusBadge status="succeeded" size="md" />
      </>
    ),
  },
  {
    name: "DetailStatusChip",
    blurb:
      "Secondary outcome/tag pill — same height/radius/stroke as VocabBadge.",
    render: () => (
      <>
        <DetailStatusChip>From cache</DetailStatusChip>
        <DetailStatusChip>unattached</DetailStatusChip>
        <DetailStatusChip size="sm">agent</DetailStatusChip>
        <StatusBadge status="succeeded" size="md" />
        <DetailStatusChip>Evidence only</DetailStatusChip>
      </>
    ),
  },
  {
    name: "ConfidenceBadge",
    blurb: "Graph confidence only — not job status.",
    render: () => (
      <>
        <ConfidenceBadge confidence="confirmed" />
        <ConfidenceBadge confidence="possible" />
        <ConfidenceBadge confidence="unverified" />
      </>
    ),
  },
  {
    name: "KindBadge",
    blurb: "Entity / evidence / identifier kinds.",
    render: () => (
      <>
        <KindBadge kind="person" />
        <KindBadge kind="org" />
        <KindBadge kind="infra" />
        <KindBadge kind="file" />
      </>
    ),
  },
  {
    name: "EntityMention",
    blurb:
      "Inline entity name — link when slug set. Kind glyph lives on KindBadge.",
    render: () => (
      <>
        <EntityMention name="Ada Lovelace" />
        <EntityMention name="Acme Corp" slug="acme-corp" />
        <EntityMention name="acme.com" slug="acme-com" />
      </>
    ),
  },
  {
    name: "ClaimClassBadge",
    blurb: "Claim class — not KindBadge.",
    render: () => (
      <>
        <ClaimClassBadge claimClass="observation" />
        <ClaimClassBadge claimClass="allegation" />
      </>
    ),
  },
  {
    name: "PatchOpBadge",
    blurb: "Triage patch ops.",
    render: () => (
      <>
        <PatchOpBadge op="create" />
        <PatchOpBadge op="upsert" />
        <PatchOpBadge op="update" />
      </>
    ),
  },
  {
    name: "ConfidenceSelect",
    blurb: "CONTROL chrome (h-8) — options in, no I/O.",
    render: () => (
      <ConfidenceSelect
        value="possible"
        onChange={() => {
          /* fixture */
        }}
      />
    ),
  },
  {
    name: "EntityCombobox",
    blurb: "CONTROL chrome — parent owns fetch.",
    render: () => (
      <EntityCombobox
        entities={[
          { id: "e1", name: "Alice" },
          { id: "e2", name: "Bob" },
        ]}
        value="e1"
        onValueChange={() => {
          /* fixture */
        }}
      />
    ),
  },
  {
    name: "ExternalUrl",
    blurb: "External link + icon — not router Link.",
    render: () => <ExternalUrl href={DEMO_EXTERNAL_HREF} />,
  },
  {
    name: "SearchField",
    blurb: "CONTROL chrome — filters/toolbars.",
    render: () => (
      <SearchField
        value=""
        onValueChange={() => {
          /* fixture */
        }}
        aria-label="Atom catalog search demo"
        placeholder="Search…"
        className="max-w-xs"
      />
    ),
  },
  {
    name: "FieldSelect",
    blurb: "CONTROL Select — string options; no native select.",
    render: () => (
      <FieldSelect
        value="collect"
        onValueChange={() => {
          /* fixture */
        }}
        aria-label="Kind filter demo"
        options={[
          { value: "", label: "All kinds" },
          { value: "collect", label: "Collect" },
          { value: "enrich", label: "Enrich" },
        ]}
      />
    ),
  },
  {
    name: "SectionLabel",
    blurb: "Small meta caption — normal case; not page headings.",
    render: () => <SectionLabel>Meta label</SectionLabel>,
  },
  {
    name: "RelativeTime",
    blurb: "Relative instant with absolute tooltip.",
    render: () => <RelativeTime value={SAMPLE_AT} />,
  },
  {
    name: "RichTextEditor",
    blurb:
      "Plate Markdown editor — dossier Summary/Notes SoT is a markdown string.",
    render: () => (
      <RichTextEditor
        value={"**BLUF** — sample marks and a list:\n\n- lead\n- follow-up"}
        onChange={() => {
          /* fixture */
        }}
        placeholder="Write…"
        className="w-full max-w-md"
      />
    ),
  },
  {
    name: "Timestamp",
    blurb: "Instant wrapper with tooltip.",
    render: () => (
      <Timestamp value={SAMPLE_AT}>
        {new Date(SAMPLE_AT).toLocaleString()}
      </Timestamp>
    ),
  },
  {
    name: "FormInlineError",
    blurb: "Field/mutation errors — not load failures.",
    render: () => <FormInlineError>Field is required</FormInlineError>,
  },
  {
    name: "FormInlineWarning",
    blurb: "Soft confirm / evidence hints.",
    render: () => (
      <FormInlineWarning>confirmed requires evidence</FormInlineWarning>
    ),
  },
  {
    name: "ComposerShell",
    blurb: "Muted bordered add/edit surface.",
    render: () => (
      <ComposerShell className="max-w-sm">
        <FormInlineError>Example composer body</FormInlineError>
      </ComposerShell>
    ),
  },
  {
    name: "RowActionsMenu",
    blurb: "Hover-reveal row menu — parent needs group.",
    render: () => (
      <div className="group flex items-center gap-2">
        <span className="text-sm">Row</span>
        <RowActionsMenu label="Row actions">
          <DropdownMenuItem>Edit</DropdownMenuItem>
        </RowActionsMenu>
      </div>
    ),
  },
  {
    name: "TimelineSpine",
    blurb: "Vertical spine for events/questions.",
    render: () => (
      <TimelineSpine className="ml-2 min-h-10 pl-4">
        <TimelineDot className="bg-foreground top-1.5 -left-[1.3rem] size-2" />
        <span className="text-copy-sm text-muted-foreground">Milestone</span>
      </TimelineSpine>
    ),
  },
  {
    name: "InlineLoading",
    blurb: "Region wait — not page skeleton.",
    render: () => <InlineLoading label="Loading…" />,
  },
  {
    name: "ActiveTabBody",
    blurb: "Tab gate — inactive null; pending skeleton.",
    render: () => (
      <div className="border-border w-full max-w-sm space-y-2 rounded-md border p-3">
        <ActiveTabBody active pending pendingSections={1}>
          <p className="text-xs">Hidden when pending</p>
        </ActiveTabBody>
        <ActiveTabBody active>
          <p className="text-copy-sm">Active tab body</p>
        </ActiveTabBody>
      </div>
    ),
  },
  {
    name: "SuspenseTabBody",
    blurb: "Suspense + StackBodySkeleton inside ActiveTabBody.",
    render: () => (
      <div className="border-border w-full max-w-sm rounded-md border p-3">
        <SuspenseTabBody>
          <p className="text-copy-sm">Resolved tab content</p>
        </SuspenseTabBody>
      </div>
    ),
  },
  {
    name: "QueueSkeleton",
    blurb: "Data-slot skeleton rows.",
    render: () => (
      <div className="border-border w-full max-w-sm overflow-hidden rounded-md border">
        <QueueSkeleton rows={3} />
      </div>
    ),
  },
  {
    name: "FetchErrorAlert",
    blurb: "Load failures — not field validation.",
    render: () => <FetchErrorAlert error="Fixture load failed." />,
  },
  {
    name: "EmptyState",
    blurb: "blank-slate / no-results / cleared — dashed outline.",
    render: () => (
      <EmptyState
        intent="blank-slate"
        items="jobs"
        description="Run a Capability to populate."
        className="w-full max-w-sm"
      />
    ),
  },
  {
    name: "DetailEmpty",
    blurb: "Select-none Detail only — not loading.",
    render: () => (
      <DetailEmpty
        title="Select a job"
        description="Choose a run from the queue."
        className="h-36 w-full max-w-sm"
      />
    ),
  },
  {
    name: "QueueHeader",
    blurb: "Queue column title + count.",
    render: () => (
      <div className="border-border w-full max-w-sm overflow-hidden rounded-md border">
        <QueueHeader label="Queue" count={4} />
      </div>
    ),
  },
  {
    name: "QueueRow",
    blurb: "Homogeneous work-list hit target.",
    render: () => (
      <div className="border-border w-full max-w-sm overflow-hidden rounded-md border">
        <QueueRow
          selected
          live
          className="py-2"
          trailing={<StatusDot status="running" pulse />}
        >
          <QueueRowTitle>network.dns.lookup</QueueRowTitle>
          <QueueRowMeta>
            <RelativeTime value={SAMPLE_AT} />
            <span aria-hidden>·</span>
            <IdChip value={SAMPLE_ID} className="opacity-80" />
          </QueueRowMeta>
        </QueueRow>
      </div>
    ),
  },
  {
    name: "SplitView",
    blurb: "Queue | Detail resizable split.",
    render: () => (
      <div className="border-border h-28 w-full max-w-md overflow-hidden rounded-md border">
        <SplitView
          groupId="ui-atom-split"
          list={
            <aside className="flex h-full min-h-0 flex-col p-2">
              <span className="text-label-mono-sm text-muted-foreground">
                Queue
              </span>
            </aside>
          }
          detail={
            <div className="flex h-full min-h-0 flex-col p-2">
              <span className="text-label-mono-sm text-muted-foreground">
                Detail
              </span>
            </div>
          }
        />
      </div>
    ),
  },
];

export function AtomsSection() {
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return ATOM_CATALOG;
    return ATOM_CATALOG.filter((a) => a.name.toLowerCase().includes(q));
  }, [filter]);

  return (
    <GuideSection
      id="atoms"
      title="Atoms"
      blurb="Hand-owned Watchdog primitives required on /ui. Prefer these over freestyle chips, raw enums, or .slice ids."
    >
      <SearchField
        value={filter}
        onValueChange={setFilter}
        aria-label="Filter atoms"
        placeholder="Filter atoms…"
        className="max-w-md"
      />
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((atom) => (
          <Specimen key={atom.name} label={atom.name} blurb={atom.blurb}>
            {atom.render()}
          </Specimen>
        ))}
        {visible.length === 0 ? (
          <p className="text-muted-foreground text-sm md:col-span-2">
            No atoms match “{filter.trim()}”.
          </p>
        ) : null}
      </div>
    </GuideSection>
  );
}
