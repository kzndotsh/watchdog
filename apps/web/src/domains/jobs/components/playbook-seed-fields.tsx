import type { ReactNode } from "react";

import type { PlaybookSeedView } from "@/domains/jobs/lib/playbook-seed-view";
import { cn } from "@/lib/utils";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
import { Input } from "@/shared/ui/shadcn/input";
import { trimmedOrUndefined, type PlaybookSeedKind } from "@watchdog/schemas";

export interface UrlDumpOption {
  id: string;
  sourceUrl: string;
  label?: string | null;
}

export interface PlaybookRunFormValues {
  playbookId: string;
  host: string;
  url: string;
  evidenceId: string;
  entityId: string;
  ip: string;
  email: string;
  hash: string;
  handle: string;
}

const SEED_TEXT_FIELDS = [
  {
    kind: "host",
    name: "host",
    placeholder: "example.com",
    label: "Seed host",
    inlineClassName: "h-8 min-w-[8rem] flex-1 text-xs sm:max-w-[10rem]",
  },
  {
    kind: "ip",
    name: "ip",
    placeholder: "1.2.3.4",
    label: "Seed IP",
    inlineClassName:
      "h-8 min-w-[8rem] flex-1 font-mono text-xs sm:max-w-[10rem]",
  },
  {
    kind: "email",
    name: "email",
    placeholder: "name@example.com",
    label: "Seed email",
    inlineClassName: "h-8 min-w-[10rem] flex-1 text-xs sm:max-w-[14rem]",
  },
  {
    kind: "hash",
    name: "hash",
    placeholder: "sha256…",
    label: "Seed hash",
    inlineClassName:
      "h-8 min-w-[10rem] flex-1 font-mono text-xs sm:max-w-[16rem]",
  },
  {
    kind: "handle",
    name: "handle",
    placeholder: "username",
    label: "Seed handle",
    inlineClassName: "h-8 min-w-[8rem] flex-1 text-xs sm:max-w-[10rem]",
  },
] as const satisfies readonly {
  kind: PlaybookSeedKind;
  name: keyof PlaybookRunFormValues;
  placeholder: string;
  label: string;
  inlineClassName: string;
}[];

interface SeedFieldApi {
  state: { value: string };
  handleBlur: () => void;
  handleChange: (value: string) => void;
}

interface PlaybookSeedFormBind {
  Field: (props: {
    name: keyof PlaybookRunFormValues;
    children: (field: SeedFieldApi) => ReactNode;
  }) => ReactNode | Promise<ReactNode>;
  setFieldValue: (name: "url", value: string) => void;
}

interface PlaybookSeedFieldsProps {
  layout: "inline" | "stacked";
  view: Pick<
    PlaybookSeedView,
    "needs" | "pickUrlDump" | "needsUrl" | "needsEvidence"
  >;
  urlDumps: UrlDumpOption[];
  entities: EntityOption[];
  form: PlaybookSeedFormBind;
}

function seedTextClassName(
  layout: "inline" | "stacked",
  spec: (typeof SEED_TEXT_FIELDS)[number]
): string {
  if (layout === "inline") return spec.inlineClassName;
  return cn(
    "h-8 w-full text-xs",
    spec.name === "ip" || spec.name === "hash" ? "font-mono" : null
  );
}

/** Seed inputs + entity attach for stacked and inline playbook run layouts. */
export function PlaybookSeedFields({
  layout,
  view,
  urlDumps,
  entities,
  form,
}: PlaybookSeedFieldsProps) {
  const neededKinds = new Set(view.needs);
  const seedFields = (
    <>
      {SEED_TEXT_FIELDS.filter((field) => neededKinds.has(field.kind)).map(
        (spec) => (
          <form.Field key={spec.name} name={spec.name}>
            {(field) => (
              <Input
                className={seedTextClassName(layout, spec)}
                placeholder={spec.placeholder}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                }}
                aria-label={spec.label}
              />
            )}
          </form.Field>
        )
      )}
      {view.pickUrlDump ? (
        <form.Field name="evidenceId">
          {(field) => (
            <FieldSelect
              className={
                layout === "stacked"
                  ? "w-full"
                  : "min-w-[12rem] flex-1 sm:max-w-xs"
              }
              contentClassName="w-max min-w-(--anchor-width) max-w-[min(24rem,calc(100vw-2rem))]"
              value={field.state.value}
              onValueChange={(id) => {
                field.handleChange(id);
                const row = urlDumps.find((d) => d.id === id);
                form.setFieldValue("url", row?.sourceUrl ?? "");
              }}
              aria-label="URL dump Evidence"
              disabled={urlDumps.length === 0}
              placeholder="Select URL dump…"
              options={urlDumps.map((d) => ({
                value: d.id,
                label: trimmedOrUndefined(d.label) ?? d.sourceUrl,
              }))}
            />
          )}
        </form.Field>
      ) : (
        <>
          {view.needsUrl ? (
            <form.Field name="url">
              {(field) => (
                <Input
                  className={
                    layout === "stacked"
                      ? "h-8 w-full text-xs"
                      : "h-8 min-w-[10rem] flex-1 text-xs sm:max-w-xs"
                  }
                  placeholder="Host or domain name"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  aria-label="Seed URL"
                />
              )}
            </form.Field>
          ) : null}
          {view.needsEvidence ? (
            <form.Field name="evidenceId">
              {(field) => (
                <Input
                  className={
                    layout === "stacked"
                      ? "h-8 w-full font-mono text-xs"
                      : "h-8 min-w-[12rem] flex-1 font-mono text-xs sm:max-w-xs"
                  }
                  placeholder="Evidence id"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  aria-label="Seed Evidence id"
                />
              )}
            </form.Field>
          ) : null}
        </>
      )}
    </>
  );

  const entityField = (
    <form.Field name="entityId">
      {(field) => (
        <EntityCombobox
          entities={entities}
          value={field.state.value}
          onValueChange={(id) => {
            field.handleChange(id);
          }}
          emptyLabel="No entity"
          aria-label="Attach to entity"
          hideWhenEmpty
          className={layout === "stacked" ? "w-full" : undefined}
        />
      )}
    </form.Field>
  );

  if (layout === "stacked") {
    return (
      <div className="grid w-full grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-2">{seedFields}</div>
        {entityField}
      </div>
    );
  }

  return (
    <>
      {seedFields}
      {entityField}
    </>
  );
}
