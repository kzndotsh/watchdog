import {
  KeyRoundIcon,
  SlidersHorizontalIcon,
  WorkflowIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { GuideSection } from "@/routes/_protected/ui/-guide-chrome";
import { Chip } from "@/shared/ui/chip";
import { Button } from "@/shared/ui/primitives/button";
import { TabCount } from "@/shared/ui/tab-count";
import { Kbd } from "@watchdog/ui/components/kbd";

/* `trim-text` (CSS `text-box: trim-both cap alphabetic`) beside the same atoms without it.
 * Each atom shows at 1x and at 3x with a line through its box's vertical centre: centred text
 * has as much room above its capitals as below its baseline. */

/** One atom with a hairline through the middle of its own box. */
function Centred({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-flex">
      {children}
      <span
        aria-hidden
        className="bg-signal/70 pointer-events-none absolute inset-x-0 top-1/2 h-px"
      />
    </span>
  );
}

type Atoms = (trim: string) => ReactNode;

type ColumnProps = {
  title: string;
  atoms: Atoms;
  trim: string;
};

function Column({ title, atoms, trim }: ColumnProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <span className="text-2xs text-muted-foreground font-mono">{title}</span>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {atoms(trim)}
      </div>
      <div className="flex [zoom:3] flex-wrap items-center gap-2 text-xs">
        {atoms(trim)}
      </div>
    </div>
  );
}

function Comparison({ label, atoms }: { label: string; atoms: Atoms }) {
  return (
    <div className="border-border bg-card/30 flex flex-col gap-3 rounded-md border p-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="grid gap-6 md:grid-cols-2">
        <Column title="normal" atoms={atoms} trim="" />
        <Column title="trim-text" atoms={atoms} trim="trim-text" />
      </div>
    </div>
  );
}

const chips: Atoms = (trim) => (
  <>
    <Centred>
      <Chip className={trim}>
        <WorkflowIcon />
        Playbook
      </Chip>
    </Centred>
    <Centred>
      <Chip className={trim} label="Third party" />
    </Centred>
    <Centred>
      <Chip className={trim}>
        <KeyRoundIcon />
        Missing API key
      </Chip>
    </Centred>
    <Centred>
      <Chip size="sm" className={trim} label="Cap" />
    </Centred>
  </>
);

const kbds: Atoms = (trim) => (
  <>
    <Centred>
      <Kbd className={trim}>/</Kbd>
    </Centred>
    <Centred>
      <Kbd className={trim}>Ctrl</Kbd>
    </Centred>
    <Centred>
      <Kbd className={trim}>K</Kbd>
    </Centred>
    <Centred>
      <Kbd className={trim}>Esc</Kbd>
    </Centred>
  </>
);

const counts: Atoms = (trim) => (
  <>
    <Centred>
      <TabCount n={3} className={trim} />
    </Centred>
    <Centred>
      <TabCount n={17} className={trim} />
    </Centred>
    <Centred>
      <TabCount n={128} className={trim} />
    </Centred>
  </>
);

const buttons: Atoms = (trim) => (
  <>
    <Centred>
      <Button size="xs" variant="outline" className={trim}>
        Retry
      </Button>
    </Centred>
    <Centred>
      <Button size="sm" variant="outline" className={trim}>
        <SlidersHorizontalIcon />
        Display options
      </Button>
    </Centred>
    <Centred>
      <Button size="sm" className={trim}>
        Add API keys
      </Button>
    </Centred>
  </>
);

export function TextTrimSection() {
  return (
    <GuideSection
      id="trimming"
      title="Text trim"
      blurb="trim-text (CSS text-box: trim-both cap alphabetic) against the same atoms without it, at 1x and 3x. The line marks each box's vertical centre."
    >
      <div className="flex flex-col gap-4">
        <Comparison label="Chips" atoms={chips} />
        <Comparison label="Kbd" atoms={kbds} />
        <Comparison label="Count badges" atoms={counts} />
        <Comparison label="Compact buttons" atoms={buttons} />
      </div>
    </GuideSection>
  );
}
