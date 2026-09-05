import { useForm } from "@tanstack/react-form";
import { BriefcaseIcon, CheckIcon, DownloadIcon, PlusIcon } from "lucide-react";
import { useRef } from "react";

import { createCaseFn } from "@/domains/cases/cases.functions";
import { DeleteCaseDialog } from "@/domains/cases/components/delete-case-dialog";
import { useCaseList } from "@/domains/cases/hooks/use-case-list";
import type { CaseRecord } from "@/domains/cases/types";
import { cn, errMessage, nextAutoSlug, slugifyName } from "@/lib/utils";
import { Page, PageHeader } from "@/shared/layout/page";
import { PageToolbar } from "@/shared/layout/page-toolbar";
import {
  CASE_CARD_ACTIVE_CLASS,
  CASE_CARD_MIN_HEIGHT_CLASS,
  CASE_CARD_SHELL_CLASS,
  CASE_CREATE_SHELL_CLASS,
} from "@/shared/ui/case-card-shell";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { EmptyState } from "@/shared/ui/empty-state";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { PendingRegion } from "@/shared/ui/pending-region";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { SearchField } from "@/shared/ui/search-field";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/shared/ui/shadcn/alert-dialog";
import { Button } from "@/shared/ui/shadcn/button";
import { DropdownMenuItem } from "@/shared/ui/shadcn/dropdown-menu";
import { Field, FieldLabel } from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";
import { Spinner } from "@/shared/ui/shadcn/spinner";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { CardGridSkeleton } from "@/shared/ui/skeletons";

function CaseCard({
  caseRow,
  isActive,
  selecting,
  onWork,
  onSetActiveOnly,
  onDelete,
}: {
  caseRow: CaseRecord;
  isActive: boolean;
  selecting: boolean;
  onWork: () => void;
  onSetActiveOnly: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        CASE_CARD_SHELL_CLASS,
        "group flex h-full min-h-36 flex-col gap-3 p-5",
        isActive && CASE_CARD_ACTIVE_CLASS
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm leading-tight font-medium">
            {caseRow.name}
          </p>
          <p className="text-muted-foreground text-label-mono-sm truncate">
            {caseRow.slug}
          </p>
        </div>
        {isActive ? (
          <DetailStatusChip size="sm" className="shrink-0 gap-0.5">
            <CheckIcon className="size-2.5" />
            Active
          </DetailStatusChip>
        ) : null}
        <RowActionsMenu label="Case actions" className="opacity-100">
          {isActive ? null : (
            <DropdownMenuItem disabled={selecting} onClick={onSetActiveOnly}>
              Set as active case
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </RowActionsMenu>
      </div>

      {caseRow.description ? (
        <p className="text-muted-foreground line-clamp-2 min-w-0 text-xs leading-snug">
          {caseRow.description}
        </p>
      ) : (
        <p className="text-muted-foreground/70 text-xs italic">
          No description
        </p>
      )}

      <Button
        variant="default"
        size="sm"
        className="mt-auto h-8 self-start text-xs"
        type="button"
        disabled={selecting}
        onClick={onWork}
      >
        Open
      </Button>
    </div>
  );
}

function NewCaseCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(CASE_CREATE_SHELL_CLASS, "h-full min-h-36 p-5")}
    >
      <PlusIcon className="size-5" />
      <span className="text-sm font-medium">New Case</span>
    </button>
  );
}

function CaseSlotGhost() {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none", CASE_CARD_MIN_HEIGHT_CLASS)}
    />
  );
}

function CreateCaseDialog({
  open,
  onOpenChange,
  onCreated,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const lastNameRef = useRef("");

  const form = useForm({
    defaultValues: { name: "", slug: "", description: "" },
    onSubmit: async ({ value }) => {
      const nextName = value.name.trim();
      if (!nextName) return;
      try {
        await createCaseFn({
          data: {
            name: nextName,
            slug: (value.slug || slugifyName(nextName)).trim(),
            description: value.description.trim() || undefined,
          },
        });
        form.reset();
        lastNameRef.current = "";
        onOpenChange(false);
        onCreated();
      } catch (error) {
        onError(errMessage(error, "Create failed"));
      }
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
      lastNameRef.current = "";
    }
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-md">
        <form
          className="flex flex-col gap-6"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogMedia>
              <BriefcaseIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>New Case</AlertDialogTitle>
            <AlertDialogDescription>
              Create a Case to scope graph, intake, and Cap runs.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form.Field
            name="name"
            validators={{
              onSubmit: ({ value }) =>
                value.trim() ? undefined : "Enter a case name",
            }}
            listeners={{
              onChange: ({ value }) => {
                const auto = nextAutoSlug(
                  lastNameRef.current,
                  form.getFieldValue("slug"),
                  value
                );
                lastNameRef.current = value;
                if (auto !== null) form.setFieldValue("slug", auto);
              },
            }}
          >
            {(field) => (
              <Field data-invalid={!!field.state.meta.errors[0]}>
                <FieldLabel htmlFor="new-case-title">Case name</FieldLabel>
                <Input
                  id="new-case-title"
                  autoFocus
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  placeholder="Case name…"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  disabled={form.state.isSubmitting}
                  aria-invalid={!!field.state.meta.errors[0]}
                />
                <FormInlineError>{field.state.meta.errors[0]}</FormInlineError>
              </Field>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="case-description">Description</FieldLabel>
                <Textarea
                  id="case-description"
                  placeholder="Optional description…"
                  rows={3}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  disabled={form.state.isSubmitting}
                />
              </Field>
            )}
          </form.Field>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={form.state.isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
                name: state.values.name,
              })}
            >
              {({ canSubmit, isSubmitting, name }) => (
                <Button
                  type="submit"
                  disabled={isSubmitting || !canSubmit || !name.trim()}
                >
                  {isSubmitting ? <Spinner /> : null}
                  Create
                </Button>
              )}
            </form.Subscribe>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function exportActiveCaseZip(activeId: string): void {
  const a = document.createElement("a");
  a.href = `/api/v1/cases/${activeId}/export.zip`;
  a.click();
}

function CaseListHeaderActions({
  activeId,
  onCreate,
}: {
  activeId: string;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {activeId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            exportActiveCaseZip(activeId);
          }}
        >
          <DownloadIcon className="size-3.5" />
          Export
        </Button>
      ) : null}
      <Button type="button" size="sm" onClick={onCreate}>
        <PlusIcon className="size-3.5" />
        New Case
      </Button>
    </div>
  );
}

function CaseListGrid({
  pending,
  casesLength,
  filtered,
  activeId,
  selecting,
  ghostCount,
  search,
  onClearSearch,
  onSelectCase,
  onWorkCase,
  onDeleteCase,
  onCreate,
}: {
  pending: boolean;
  casesLength: number;
  filtered: CaseRecord[];
  activeId: string;
  selecting: boolean;
  ghostCount: number;
  search: string;
  onClearSearch: () => void;
  onSelectCase: (id: string) => void;
  onWorkCase: (caseRow: CaseRecord) => void;
  onDeleteCase: (caseRow: CaseRecord) => void;
  onCreate: () => void;
}) {
  if (casesLength > 0 && filtered.length === 0 && !pending) {
    return (
      <EmptyState
        intent="no-results"
        items="cases"
        query={search}
        onClearFilters={onClearSearch}
        className="min-h-0 flex-1"
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PendingRegion
        loading={pending}
        label="Loading cases"
        fallback={<CardGridSkeleton />}
      >
        <div className="grid h-full min-h-full auto-rows-[minmax(9rem,1fr)] grid-cols-1 gap-3 p-px sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((caseRow) => (
            <CaseCard
              key={caseRow.id}
              caseRow={caseRow}
              isActive={caseRow.id === activeId}
              selecting={selecting}
              onWork={() => {
                onWorkCase(caseRow);
              }}
              onSetActiveOnly={() => {
                onSelectCase(caseRow.id);
              }}
              onDelete={() => {
                onDeleteCase(caseRow);
              }}
            />
          ))}
          <NewCaseCard onClick={onCreate} />
          {Array.from({ length: ghostCount }, (_, i) => (
            <CaseSlotGhost key={`ghost-${i}`} />
          ))}
        </div>
      </PendingRegion>
    </div>
  );
}

export function CaseList() {
  const {
    activeId,
    cases,
    search,
    setSearch,
    filtered,
    ghostCount,
    pending,
    submitError,
    createOpen,
    setCreateOpen,
    deleteTarget,
    selecting,
    selectCase,
    openCase,
    openCreate,
    clearSearch,
    beginDeleteCase,
    handleCreateSuccess,
    handleCreateError,
    closeDeleteDialog,
    handleCaseDeleted,
  } = useCaseList();

  return (
    <Page className="min-h-0 gap-4 overflow-hidden">
      <PageHeader
        actions={
          <CaseListHeaderActions activeId={activeId} onCreate={openCreate} />
        }
      />

      <FormInlineError>{submitError}</FormInlineError>

      <PageToolbar
        center={
          <SearchField
            value={search}
            onValueChange={setSearch}
            placeholder="Search cases…"
            aria-label="Search cases"
            className="max-w-md min-w-[12rem]"
          />
        }
      />

      <CaseListGrid
        pending={pending}
        casesLength={cases.length}
        filtered={filtered}
        activeId={activeId}
        selecting={selecting}
        ghostCount={ghostCount}
        search={search}
        onClearSearch={clearSearch}
        onSelectCase={selectCase}
        onWorkCase={(caseRow) => {
          void openCase(caseRow);
        }}
        onDeleteCase={beginDeleteCase}
        onCreate={openCreate}
      />

      <CreateCaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreateSuccess}
        onError={handleCreateError}
      />

      <DeleteCaseDialog
        caseRow={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={closeDeleteDialog}
        onDeleted={handleCaseDeleted}
      />
    </Page>
  );
}
