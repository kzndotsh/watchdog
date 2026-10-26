/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- dialog + shared form validators */
import { useForm } from "@tanstack/react-form";
import { useMemo, useState, type SubmitEvent } from "react";

import type { EdgeRecord } from "@/domains/entities/edges/types";
import { entityPickerPort } from "@/domains/entities/queries";
import { evidencePickerPort } from "@/domains/intake/queries";
import { isConfirmedBlocked } from "@/shared/lib/confirmed-evidence";
import { FieldCombobox } from "@/shared/ui/field-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import { SearchedEvidencePicker } from "@/shared/ui/intake/searched-evidence-picker";
import { Button } from "@/shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";
import { SearchedEntityCombobox } from "@/shared/ui/searched-entity-combobox";
import { CONFIDENCE_OPTIONS } from "@/shared/ui/vocab";
import {
  clampEdgePhrase,
  edgePhraseOptionsForPeers,
  peerKindAllowedForPhrase,
  predicateLabel,
} from "@/shared/ui/vocab/edge-predicate";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";
import {
  parseOptionalTrimmedUuid,
  trimmedConfidenceTierSchema,
  type ConfidenceTier,
  type EdgeOrientation,
  type EdgePredicate,
  type EntityKind,
  entityDisplayLabel,
  EDGE_PREDICATE_META,
  ENTITY_KINDS,
  edgePhraseValue,
  parseEdgePhraseValue,
} from "@watchdog/schemas/shared";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";

/** The peer the form names: picked from the server-searched picker, or the edited edge's. */
type ConnectionPeer = {
  id: string;
  name: string;
  slug: string;
  kind: EntityKind;
};

/** One stand-in per Entity kind: with no peer picked, any kind may be the peer. */
const ANY_KIND_PEERS = ENTITY_KINDS.map((kind) => ({
  id: kind,
  name: kind,
  kind,
}));

export type ConnectionFormValues = {
  peerId: string;
  predicate: EdgePredicate;
  orientation: EdgeOrientation;
  notes: string;
  confidence: ConfidenceTier;
  evidenceIds: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: EdgeRecord | null;
  center: { id: string; name: string; slug: string; kind: EntityKind };
  /** The Case whose Entities and Evidence the pickers search (#559). */
  caseId: string;
  isBusy?: boolean;
  error?: string | null;
  onSubmit: (values: ConnectionFormValues) => void | Promise<void>;
};

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
export function connectionFormIssues(
  v: ConnectionFormValues,
  centerEntityId?: string
): string[] {
  const issues: string[] = [];
  const peerId = v.peerId.trim();
  if (peerId === "") issues.push("Select a peer entity");
  const scopedCenterId = centerEntityId?.trim();
  if (scopedCenterId !== undefined && peerId === scopedCenterId) {
    issues.push("Cannot connect an entity to itself");
  }
  if (v.predicate === "related_to" && !v.notes.trim()) {
    issues.push("related_to needs a short why (notes)");
  }
  if (isConfirmedBlocked(v.confidence, v.evidenceIds)) {
    issues.push(CONFIRMED_REQUIRES_EVIDENCE);
  }
  return issues;
}

/**
 * The form mounts with the dialog and again for another edge or mode (`key`), so its
 * values always start from the connection on screen; nothing resets it afterwards.
 */
function ConnectionForm({
  onClose,
  mode,
  initial,
  center,
  caseId,
  isBusy,
  error,
  onSubmit,
}: Omit<Props, "open" | "onOpenChange" | "isBusy" | "error"> & {
  isBusy: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const form = useForm({
    defaultValues:
      mode === "edit" && initial ? defaultsFromEdge(initial) : CREATE_DEFAULTS,
    onSubmit: async ({ value }) => {
      const normalized = {
        ...value,
        peerId: value.peerId.trim(),
        notes: value.notes.trim(),
      };
      if (connectionFormIssues(normalized, center.id).length > 0) return;
      await onSubmit(normalized);
    },
  });

  const [peer, setPeer] = useState<ConnectionPeer | null>(
    mode === "edit" && initial
      ? {
          id: initial.peerId,
          name: initial.peerName,
          slug: initial.peerSlug,
          kind: initial.peerKind,
        }
      : null
  );
  const evidencePort = useMemo(() => evidencePickerPort(caseId), [caseId]);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    e.stopPropagation();
    void form.handleSubmit();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {mode === "edit" ? "Edit connection" : "Add connection"}
        </DialogTitle>
      </DialogHeader>

      <FieldGroup>
        <form.Subscribe
          selector={(s) => ({
            predicate: s.values.predicate,
            orientation: s.values.orientation,
          })}
        >
          {({ predicate, orientation }) => (
            <form.Field name="peerId">
              {(field) => (
                <Field>
                  <FieldLabel>Peer</FieldLabel>
                  <SearchedEntityCombobox
                    port={entityPickerPort(caseId, {
                      kinds: ENTITY_KINDS.filter((kind) =>
                        peerKindAllowedForPhrase(
                          center.kind,
                          kind,
                          predicate,
                          orientation
                        )
                      ),
                    })}
                    excludeIds={[center.id]}
                    value={field.state.value}
                    onValueChange={(next) => {
                      const peerId =
                        parseOptionalTrimmedUuid(next) ?? next.trim();
                      field.handleChange(peerId);
                    }}
                    onEntityChange={(picked) => {
                      if (picked?.kind === undefined) return;
                      setPeer({
                        id: picked.id,
                        name: picked.name,
                        slug: picked.slug ?? "",
                        kind: picked.kind,
                      });
                      const clamped = clampEdgePhrase(
                        center.kind,
                        picked.kind,
                        form.getFieldValue("predicate"),
                        form.getFieldValue("orientation")
                      );
                      form.setFieldValue("predicate", clamped.predicate);
                      form.setFieldValue("orientation", clamped.orientation);
                    }}
                    emptyLabel="Select entity…"
                    shouldAllowEmpty={false}
                    disabled={isBusy}
                    aria-label="Peer entity"
                  />
                </Field>
              )}
            </form.Field>
          )}
        </form.Subscribe>

        <form.Subscribe
          selector={(s) => ({
            peerId: s.values.peerId,
            predicate: s.values.predicate,
            orientation: s.values.orientation,
          })}
        >
          {({ peerId, predicate, orientation }) => {
            const scopedPeerId =
              parseOptionalTrimmedUuid(peerId) ?? peerId.trim();
            const shownPeer =
              peer !== null && peer.id === scopedPeerId ? peer : undefined;
            const phrases = edgePhraseOptionsForPeers(
              center.kind,
              ANY_KIND_PEERS,
              shownPeer?.kind
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
                    if (
                      shownPeer &&
                      !peerKindAllowedForPhrase(
                        center.kind,
                        shownPeer.kind,
                        parsed.predicate,
                        parsed.orientation
                      )
                    ) {
                      form.setFieldValue("peerId", "");
                    }
                  }}
                  disabled={isBusy || selectOptions.length === 0}
                  placeholder="Search relationships…"
                  emptyText="No matching relationships."
                  aria-label="Relationship"
                />
                {shownPeer ? (
                  <p className="text-muted-foreground text-xs">
                    {orientation === "forward"
                      ? `${entityDisplayLabel(center)} → ${predicateLabel(predicate, "out")} → ${entityDisplayLabel(shownPeer)}`
                      : `${entityDisplayLabel(shownPeer)} → ${predicateLabel(predicate, "out")} → ${entityDisplayLabel(center)}`}
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
                    {predicate === "related_to" ? "Why (required)" : "Notes"}
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
                    disabled={isBusy}
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
                  field.handleChange(trimmedConfidenceTierSchema.parse(v));
                }}
                disabled={isBusy}
                aria-label="Confidence"
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="evidenceIds">
          {(field) => (
            <Field>
              <FieldLabel>Evidence</FieldLabel>
              <SearchedEvidencePicker
                port={evidencePort}
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
          const issues = connectionFormIssues(values, center.id).filter(
            (i) => i !== "Select a peer entity"
          );
          return issues.map((issue) => (
            <FormInlineWarning key={issue}>{issue}</FormInlineWarning>
          ));
        }}
      </form.Subscribe>

      <FieldError>{error}</FieldError>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          disabled={isBusy}
          onClick={onClose}
        >
          Cancel
        </Button>
        <form.Subscribe selector={(s) => s.values}>
          {(values) => (
            <Button
              type="submit"
              loading={isBusy}
              disabled={connectionFormIssues(values, center.id).length > 0}
            >
              {mode === "edit" ? "Save" : "Add"}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

export function ConnectionDialog({
  open,
  onOpenChange,
  initial,
  mode,
  isBusy = false,
  error = null,
  ...rest
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ConnectionForm
          key={`${mode}:${rest.center.id}:${initial?.id ?? ""}`}
          mode={mode}
          initial={initial}
          isBusy={isBusy}
          error={error}
          onClose={() => {
            onOpenChange(false);
          }}
          {...rest}
        />
      </DialogContent>
    </Dialog>
  );
}
