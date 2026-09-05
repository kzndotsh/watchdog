import { useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { Link, notFound, useNavigate } from "@tanstack/react-router";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { ClaimsSection } from "@/domains/dossier/components/claims-section";
import { ConnectionsSection } from "@/domains/dossier/components/connections-section";
import { DisproveSection } from "@/domains/dossier/components/disprove-section";
import { DossierEditDialog } from "@/domains/dossier/components/dossier-edit-dialog";
import { DossierExportMenu } from "@/domains/dossier/components/dossier-export-menu";
import {
  dossierClaimsFallback,
  dossierConnectionsFallback,
  dossierEvidenceFallback,
  dossierEventsFallback,
  dossierOverviewFallback,
  dossierQuestionsFallback,
  dossierIdentifiersFallback,
  dossierNotesFallback,
} from "@/domains/dossier/components/dossier-tab-pending";
import { EntityEvidenceSection } from "@/domains/dossier/components/entity-evidence-section";
import { EventsSection } from "@/domains/dossier/components/events-section";
import { EvidencePreviewDrawer } from "@/domains/dossier/components/evidence-preview-drawer";
import { IdentifiersSection } from "@/domains/dossier/components/identifiers-section";
import { QuestionsSection } from "@/domains/dossier/components/questions-section";
import {
  NotesSection,
  SummarySection,
} from "@/domains/dossier/components/summary-notes-section";
import { useDossierShell } from "@/domains/dossier/hooks/use-dossier-shell";
import { DeleteEntityDialog } from "@/domains/entities/components/delete-entity-dialog";
import { entityBySlugQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { DossierTasksSection } from "@/domains/tasks/components/dossier-tasks-section";
import { Page, PageHeader } from "@/shared/layout/page";
import { bindCasesChangedInvalidation } from "@/shared/lib/query-invalidation";
import { ActiveTabBody, SuspenseTabBody } from "@/shared/ui/active-tab-body";
import { EditableTextCell } from "@/shared/ui/data-table";
import { EmptyState } from "@/shared/ui/empty-state";
import { Button } from "@/shared/ui/shadcn/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui/shadcn/tabs";
import { TabCount } from "@/shared/ui/tab-count";
import { EntityKindGlyph } from "@/shared/ui/vocab";

type DossierTab =
  | "overview"
  | "notes"
  | "claims"
  | "identifiers"
  | "connections"
  | "evidence"
  | "events"
  | "questions"
  | "tasks";

const DOSSIER_TABS: readonly DossierTab[] = [
  "overview",
  "notes",
  "claims",
  "identifiers",
  "connections",
  "evidence",
  "events",
  "questions",
  "tasks",
] as const;

function isDossierTab(value: string): value is DossierTab {
  return (DOSSIER_TABS as readonly string[]).includes(value);
}

function parseDossierTab(value: string | undefined): DossierTab {
  if (value !== undefined && isDossierTab(value)) {
    return value;
  }
  return "overview";
}

function DossierForEntity({
  caseId,
  entity,
  tab,
  onTabChange,
}: {
  caseId: string;
  entity: EntityRecord;
  tab: DossierTab;
  onTabChange: (tab: DossierTab) => void;
}) {
  const {
    evidenceAll,
    evidencePending,
    previewEvidence,
    setPreviewEvidence,
    editOpen,
    setEditOpen,
    editError,
    setEditError,
    handleEvidenceClick,
    counts,
    countsPending,
    renameMutation,
    editMutation,
  } = useDossierShell(caseId, entity);
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <Page density={tab === "tasks" || tab === "notes" ? "split" : "default"}>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          onTabChange(parseDossierTab(typeof v === "string" ? v : undefined));
        }}
        className="flex min-h-0 w-full flex-1 flex-col gap-4"
      >
        <PageHeader
          current={
            <EditableTextCell
              value={entity.name}
              aria-label="Entity name"
              placeholder="Name…"
              disabled={renameMutation.isPending}
              prefix={<EntityKindGlyph kind={entity.kind} size="md" />}
              className="focus-within:border-border focus-within:ring-ring/40 w-auto max-w-[min(28rem,50vw)] min-w-[6rem] focus-within:bg-transparent focus-within:ring-1 hover:bg-transparent dark:bg-transparent [&_input]:text-sm [&_input]:font-semibold [&_input]:tracking-tight"
              onCommit={(next) => {
                const name = next.trim();
                if (!name) return false;
                if (name !== entity.name) {
                  renameMutation.mutate(name);
                }
                return true;
              }}
            />
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditError(null);
                  setEditOpen(true);
                }}
              >
                <PencilIcon className="size-3.5" />
                Edit
              </Button>
              <DossierExportMenu caseId={caseId} entitySlug={entity.slug} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive gap-1.5"
                onClick={() => {
                  setDeleteOpen(true);
                }}
              >
                <Trash2Icon className="size-3.5" />
                Delete entity
              </Button>
            </div>
          }
          below={
            <TabsList
              variant="line"
              className="h-8 max-w-full justify-start overflow-x-auto"
            >
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="claims">
                Claims
                {countsPending ? null : <TabCount n={counts.claims} />}
              </TabsTrigger>
              <TabsTrigger value="identifiers">
                Identifiers
                {countsPending ? null : <TabCount n={counts.identifiers} />}
              </TabsTrigger>
              <TabsTrigger value="connections">
                Connections
                {countsPending ? null : <TabCount n={counts.connections} />}
              </TabsTrigger>
              <TabsTrigger value="evidence">
                Evidence
                {countsPending ? null : <TabCount n={counts.evidence} />}
              </TabsTrigger>
              <TabsTrigger value="events">
                Events
                {countsPending ? null : <TabCount n={counts.events} />}
              </TabsTrigger>
              <TabsTrigger value="questions">
                Questions
                {countsPending ? null : <TabCount n={counts.questions} />}
              </TabsTrigger>
              <TabsTrigger value="tasks">
                Tasks
                {countsPending ? null : <TabCount n={counts.tasks} />}
              </TabsTrigger>
            </TabsList>
          }
        />

        <DossierEditDialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditError(null);
          }}
          entity={entity}
          busy={editMutation.isPending}
          error={editError}
          onSubmit={async (values) => {
            setEditError(null);
            await editMutation.mutateAsync(values);
          }}
        />

        <DeleteEntityDialog
          caseId={caseId}
          entity={entity}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => {
            void navigate({ to: "/entities" });
          }}
        />

        <TabsContent value="overview">
          <ActiveTabBody active={tab === "overview"}>
            <SuspenseTabBody fallback={dossierOverviewFallback()}>
              <div className="flex flex-col gap-6">
                <SummarySection
                  key={`${entity.id}:${entity.updatedAt}`}
                  caseId={caseId}
                  entity={entity}
                />
                <ClaimsSection
                  caseId={caseId}
                  entityId={entity.id}
                  entitySlug={entity.slug}
                  evidenceOptions={evidenceAll}
                  onEvidenceClick={handleEvidenceClick}
                />
                <IdentifiersSection
                  caseId={caseId}
                  entityId={entity.id}
                  entitySlug={entity.slug}
                  entity={entity}
                  evidenceOptions={evidenceAll}
                  onEvidenceClick={handleEvidenceClick}
                />
                <ConnectionsSection
                  caseId={caseId}
                  entityId={entity.id}
                  entitySlug={entity.slug}
                  entity={entity}
                  evidenceOptions={evidenceAll}
                  onEvidenceClick={handleEvidenceClick}
                />
                <DisproveSection caseId={caseId} entityId={entity.id} />
              </div>
            </SuspenseTabBody>
          </ActiveTabBody>
        </TabsContent>

        <TabsContent
          value="notes"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <ActiveTabBody active={tab === "notes"}>
            <SuspenseTabBody fallback={dossierNotesFallback()}>
              <NotesSection
                key={`${entity.id}:${entity.updatedAt}`}
                caseId={caseId}
                entity={entity}
              />
            </SuspenseTabBody>
          </ActiveTabBody>
        </TabsContent>

        <TabsContent value="claims" className="flex flex-1 flex-col">
          <ActiveTabBody active={tab === "claims"}>
            <SuspenseTabBody fallback={dossierClaimsFallback()}>
              <div className="flex flex-1 flex-col gap-6">
                <ClaimsSection
                  caseId={caseId}
                  entityId={entity.id}
                  entitySlug={entity.slug}
                  evidenceOptions={evidenceAll}
                  onEvidenceClick={handleEvidenceClick}
                  emptyPresentation="panel"
                />
                <DisproveSection caseId={caseId} entityId={entity.id} />
              </div>
            </SuspenseTabBody>
          </ActiveTabBody>
        </TabsContent>

        <TabsContent value="identifiers" className="flex flex-1 flex-col">
          <ActiveTabBody active={tab === "identifiers"}>
            <SuspenseTabBody fallback={dossierIdentifiersFallback()}>
              <IdentifiersSection
                caseId={caseId}
                entityId={entity.id}
                entitySlug={entity.slug}
                entity={entity}
                evidenceOptions={evidenceAll}
                onEvidenceClick={handleEvidenceClick}
                emptyPresentation="panel"
              />
            </SuspenseTabBody>
          </ActiveTabBody>
        </TabsContent>

        <TabsContent value="connections" className="flex flex-1 flex-col">
          <ActiveTabBody active={tab === "connections"}>
            <SuspenseTabBody fallback={dossierConnectionsFallback()}>
              <ConnectionsSection
                caseId={caseId}
                entityId={entity.id}
                entitySlug={entity.slug}
                entity={entity}
                evidenceOptions={evidenceAll}
                onEvidenceClick={handleEvidenceClick}
                emptyPresentation="panel"
                fillHeight
              />
            </SuspenseTabBody>
          </ActiveTabBody>
        </TabsContent>

        <TabsContent value="evidence" className="flex flex-1 flex-col">
          <ActiveTabBody active={tab === "evidence"}>
            {evidencePending ? (
              dossierEvidenceFallback()
            ) : (
              <EntityEvidenceSection
                caseId={caseId}
                entityId={entity.id}
                evidenceOptions={evidenceAll}
                onEvidenceClick={handleEvidenceClick}
                emptyPresentation="panel"
              />
            )}
          </ActiveTabBody>
        </TabsContent>

        <TabsContent value="events" className="flex flex-1 flex-col">
          <ActiveTabBody active={tab === "events"}>
            <SuspenseTabBody fallback={dossierEventsFallback()}>
              <EventsSection
                caseId={caseId}
                entityId={entity.id}
                entitySlug={entity.slug}
                emptyPresentation="panel"
              />
            </SuspenseTabBody>
          </ActiveTabBody>
        </TabsContent>

        <TabsContent value="questions" className="flex flex-1 flex-col">
          <ActiveTabBody active={tab === "questions"}>
            <SuspenseTabBody fallback={dossierQuestionsFallback()}>
              <QuestionsSection
                caseId={caseId}
                entityId={entity.id}
                entitySlug={entity.slug}
                emptyPresentation="panel"
              />
            </SuspenseTabBody>
          </ActiveTabBody>
        </TabsContent>

        <TabsContent
          value="tasks"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <ActiveTabBody active={tab === "tasks"}>
            <DossierTasksSection
              caseId={caseId}
              entityId={entity.id}
              entitySlug={entity.slug}
            />
          </ActiveTabBody>
        </TabsContent>
      </Tabs>

      <EvidencePreviewDrawer
        evidence={previewEvidence}
        caseId={caseId}
        onClose={() => {
          setPreviewEvidence(null);
        }}
      />
    </Page>
  );
}

function DossierWithActiveCase({
  active,
  entitySlug,
  tab,
  onTabChange,
}: {
  active: CaseRecord;
  entitySlug: string;
  tab: DossierTab;
  onTabChange: (tab: DossierTab) => void;
}) {
  const [{ data: entity }] = useSuspenseQueries({
    queries: [entityBySlugQuery(active.id, entitySlug)],
  });
  if (entity === null) {
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
    throw notFound({ data: { caseName: active.name, entitySlug } });
  }

  return (
    <DossierForEntity
      caseId={active.id}
      entity={entity}
      tab={tab}
      onTabChange={onTabChange}
    />
  );
}

export function Dossier({
  entitySlug,
  tab: tabProp,
  onTabChange,
}: {
  entitySlug: string;
  tab?: string;
  onTabChange: (tab: DossierTab) => void;
}) {
  const queryClient = useQueryClient();
  const [{ data: casesCtx }] = useSuspenseQueries({
    queries: [casesContextQuery()],
  });

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

  if (!casesCtx.active) {
    return (
      <Page>
        <PageHeader />
        <EmptyState
          intent="blank-slate"
          items="cases"
          title="No active case"
          description={
            <>
              <Link to="/cases" className="underline">
                Select a case
              </Link>{" "}
              to open a dossier.
            </>
          }
        />
      </Page>
    );
  }

  return (
    <DossierWithActiveCase
      active={casesCtx.active}
      entitySlug={entitySlug}
      tab={parseDossierTab(tabProp)}
      onTabChange={onTabChange}
    />
  );
}
