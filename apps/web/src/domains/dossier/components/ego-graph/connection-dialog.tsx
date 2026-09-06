/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- dialog + shared form validators */
import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, type SubmitEvent } from "react";

import type { EvidenceOption } from "@/domains/dossier/types";
import type { EdgeRecord } from "@/domains/entities/edges/edges.functions";
import {
  CONFIRMED_REQUIRES_EVIDENCE,
  isConfirmedBlocked,
} from "@/shared/lib/confirmed-evidence";
import { EntityCombobox } from "@/shared/ui/entity-combobox";
import { FieldCombobox } from "@/shared/ui/field-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
import {
  FormInlineError,
  FormInlineWarning,
} from "@/shared/ui/form-inline-message";
import { EvidencePicker } from "@/shared/ui/intake/evidence-picker";
import { Button } from "@/shared/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/shadcn/dialog";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";
import {
  CONFIDENCE_OPTIONS,
  EDGE_PREDICATE_META,
  clampEdgePhrase,
  edgePhraseOptions,
  edgePhraseValue,
  parseEdgePhraseValue,
  predicateLabel,
} from "@/shared/ui/vocab";
import {
  confidenceTierSchema,
  type ConfidenceTier,
  type EdgeOrientation,
  type EdgePredicate,
  type EntityKind,
} from "@watchdog/schemas";

export interface ConnectionPeerOption {
  id: string;
  name: string;
  kind: EntityKind;
}

export interface ConnectionFormValues {
  peerId: string;
  predicate: EdgePredicate;
  orientation: EdgeOrientation;
  notes: string;
  confidence: ConfidenceTier;
  evidenceIds: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: EdgeRecord | null;
  center: { id: string; name: string; kind: EntityKind };
  entities: ConnectionPeerOption[];
  evidenceOptions: readonly EvidenceOption[];
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: ConnectionFormValues) => void | Promise<void>;
}

const CREATE_DEFAULTS: ConnectionFormValues = {
  peerId: "",
  predicate: "related_to",
  orientation: "forward",
  notes: "",
  confidence: "unverified",
  evidenceIds: [],
};

function orientationFromEdge(edge: EdgeRecord): EdgeOrientation {
  if (EDGE_PREDICATE_META[edge.predicate].symmetric) {
    return "forward";
  }
  if (edge.direction === "out") return "forward";
  return "inverse";
}

function defaultsFromEdge(edge: EdgeRecord): ConnectionFormValues {
  return {
    peerId: edge.peerId,
    predicate: edge.predicate,
    orientation: orientationFromEdge(edge),
    notes: edge.notes ?? "",
    confidence: edge.confidence,
    evidenceIds: [...edge.evidenceIds],
  };
}

/** Shared create/edit validation for connection form. */
export function connectionFormIssues(v: ConnectionFormValues): string[] {
  const issues: string[] = [];
  if (!v.peerId) issues.push("Select a peer entity");
  if (v.predicate === "related_to" && !v.notes.trim()) {
    issues.push("related_to needs a short why (notes)");
  }
  if (isConfirmedBlocked(v.confidence, v.evidenceIds)) {
    issues.push(CONFIRMED_REQUIRES_EVIDENCE);
  }
  return issues;
}

export function ConnectionDialog({
  open,
  onOpenChange,
  mode,
  initial,
  center,
  entities,
  evidenceOptions,
  busy = false,
  error = null,
  onSubmit,
}: Props) {
  const form = useForm({
    defaultValues:
      mode === "edit" && initial ? defaultsFromEdge(initial) : CREATE_DEFAULTS,
    onSubmit: async ({ value }) => {
      if (connectionFormIssues(value).length > 0) return;
      await onSubmit(value);
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      mode === "edit" && initial ? defaultsFromEdge(initial) : CREATE_DEFAULTS
    );
  }, [open, mode, initial, form]);

  const entitiesById = useMemo(() => {
    const map = new Map<string, ConnectionPeerOption>();
    for (const e of entities) map.set(e.id, e);
    return map;
  }, [entities]);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    e.stopPropagation();
    void form.handleSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Edit connection" : "Add connection"}
            </DialogTitle>
          </DialogHeader>

          <FieldGroup className="gap-3">
            <form.Field name="peerId">
              {(field) => (
                <Field>
                  <FieldLabel>Peer</FieldLabel>
                  <EntityCombobox
                    entities={entities}
                    value={field.state.value}
                    onValueChange={(next) => {
                      field.handleChange(next);
                      const peer = entitiesById.get(next);
                      if (!peer) return;
                      const clamped = clampEdgePhrase(
                        center.kind,
                        peer.kind,
                        form.getFieldValue("predicate"),
                        form.getFieldValue("orientation")
                      );
                      form.setFieldValue("predicate", clamped.predicate);
                      form.setFieldValue("orientation", clamped.orientation);
                    }}
                    emptyLabel="Select entity…"
                    allowEmpty={false}
                    disabled={busy}
                    aria-label="Peer entity"
                  />
                </Field>
              )}
            </form.Field>

            <form.Subscribe
              selector={(s) => ({
                peerId: s.values.peerId,
                predicate: s.values.predicate,
                orientation: s.values.orientation,
              })}
            >
              {({ peerId, predicate, orientation }) => {
                const peer = peerId ? entitiesById.get(peerId) : undefined;
                const phrases = edgePhraseOptions(
                  peer
                    ? { fromKind: center.kind, toKind: peer.kind }
                    : undefined
                );
                const selectOptions = phrases.map((p) => ({
                  value: p.value,
                  label: p.label,
                  group: p.group,
                }));
                const phraseValue = edgePhraseValue(predicate, orientation);

                return (
                  <Field>
                    <FieldLabel>Relationship</FieldLabel>
                    <FieldCombobox
                      value={phraseValue}
                      options={selectOptions}
                      onValueChange={(v) => {
                        const parsed = parseEdgePhraseValue(v);
                        if (!parsed) return;
                        form.setFieldValue("predicate", parsed.predicate);
                        form.setFieldValue("orientation", parsed.orientation);
                      }}
                      disabled={busy || selectOptions.length === 0}
                      placeholder="Search relationships…"
                      emptyText="No matching relationships."
                      aria-label="Relationship"
                    />
                    {peer ? (
                      <p className="text-muted-foreground text-xs">
                        {orientation === "forward"
                          ? `${center.name} → ${predicateLabel(predicate, "out")} → ${peer.name}`
                          : `${peer.name} → ${predicateLabel(predicate, "out")} → ${center.name}`}
                        {orientation === "inverse"
                          ? ` · here: ${predicateLabel(predicate, "in")}`
                          : null}
                      </p>
                    ) : null}
                  </Field>
                );
              }}
            </form.Subscribe>

            <form.Subscribe selector={(s) => s.values.predicate}>
              {(predicate) => (
                <form.Field name="notes">
                  {(field) => (
                    <Field>
                      <FieldLabel>
                        {predicate === "related_to"
                          ? "Why (required)"
                          : "Notes"}
                      </FieldLabel>
                      <Input
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          field.handleChange(e.target.value);
                        }}
                        placeholder={
                          predicate === "related_to"
                            ? "Short why…"
                            : "Optional notes…"
                        }
                        disabled={busy}
                      />
                    </Field>
                  )}
                </form.Field>
              )}
            </form.Subscribe>

            <form.Field name="confidence">
              {(field) => (
                <Field>
                  <FieldLabel>Confidence</FieldLabel>
                  <FieldSelect
                    value={field.state.value}
                    options={CONFIDENCE_OPTIONS}
                    onValueChange={(v) => {
                      field.handleChange(confidenceTierSchema.parse(v));
                    }}
                    disabled={busy}
                    aria-label="Confidence"
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="evidenceIds">
              {(field) => (
                <Field>
                  <FieldLabel>Evidence</FieldLabel>
                  <EvidencePicker
                    options={evidenceOptions}
                    selectedIds={field.state.value}
                    onChange={(ids) => {
                      field.handleChange(ids);
                    }}
                  />
                </Field>
              )}
            </form.Field>
          </FieldGroup>

          <form.Subscribe selector={(s) => s.values}>
            {(values) => {
              const issues = connectionFormIssues(values).filter(
                (i) => i !== "Select a peer entity"
              );
              return issues.map((issue) => (
                <FormInlineWarning key={issue}>{issue}</FormInlineWarning>
              ));
            }}
          </form.Subscribe>

          <FormInlineError>{error}</FormInlineError>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <form.Subscribe selector={(s) => s.values}>
              {(values) => (
                <Button
                  type="submit"
                  loading={busy}
                  disabled={connectionFormIssues(values).length > 0}
                >
                  {mode === "edit" ? "Save" : "Add"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
