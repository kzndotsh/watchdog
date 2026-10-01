import {
  UsersRoundIcon,
  ChevronsUpDownIcon,
  DogIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { GuideSection } from "@/routes/_protected/ui/-guide-chrome";

/* Static mockups for choosing the sidebar footer layout (org switcher + account).
 * Plain elements on purpose: they are pictures, not wired controls. */

const ORG = "Acme Investigations";

function Avatar() {
  return (
    <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs">
      EI
    </span>
  );
}

function IconButton({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-4">
      {children}
    </span>
  );
}

function OrgButton({ showName = true }: { showName?: boolean }) {
  return (
    <span className="hover:bg-sidebar-accent flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-xs [&_svg]:size-4 [&_svg]:shrink-0">
      <UsersRoundIcon />
      {showName ? (
        <>
          <span className="truncate">{ORG}</span>
          <ChevronsUpDownIcon className="ml-auto" />
        </>
      ) : null}
    </span>
  );
}

function Brand() {
  return (
    <span className="flex h-9 items-center justify-center [&_svg]:size-4">
      <DogIcon />
    </span>
  );
}

function NavPlaceholder({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="bg-muted-foreground/15 h-2 rounded-full"
          style={{ width: `${70 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

/** A slice of the sidebar: expanded (16rem) next to icon mode (3rem). */
function Variant({
  id,
  title,
  note,
  expanded,
  collapsed,
}: {
  id: string;
  title: string;
  note: string;
  expanded: ReactNode;
  collapsed: ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="space-y-0.5">
        <p className="text-sm">
          <span className="text-muted-foreground font-mono">{id}</span> ·{" "}
          {title}
        </p>
        <p className="text-muted-foreground text-xs">{note}</p>
      </figcaption>
      <div className="flex items-stretch gap-3">
        <div className="bg-sidebar border-border flex h-56 w-64 shrink-0 flex-col justify-between overflow-hidden rounded-lg border">
          {expanded}
        </div>
        <div className="bg-sidebar border-border flex h-56 w-12 shrink-0 flex-col items-center justify-between overflow-hidden rounded-lg border py-2">
          {collapsed}
        </div>
      </div>
    </figure>
  );
}

function FooterShell({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 p-2">{children}</div>;
}

export function SidebarFooterSection() {
  return (
    <GuideSection
      id="sidebar-footer"
      title="Sidebar footer variants"
      blurb="Options for the org switcher and the account control. Each shows the expanded sidebar (left) and icon mode (right). D is what the app uses today (C was tried first)."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <Variant
          id="A"
          title="One row: org left, avatar right"
          note="Org opens the switcher, the avatar opens an account menu (email, theme, settings, sign out). Icon mode stacks the two."
          expanded={
            <>
              <NavPlaceholder />
              <FooterShell>
                <div className="flex items-center gap-1">
                  <OrgButton />
                  <IconButton>
                    <Avatar />
                  </IconButton>
                </div>
              </FooterShell>
            </>
          }
          collapsed={
            <>
              <Brand />
              <div className="flex flex-col items-center gap-1">
                <IconButton>
                  <UsersRoundIcon />
                </IconButton>
                <IconButton>
                  <Avatar />
                </IconButton>
              </div>
            </>
          }
        />

        <Variant
          id="B"
          title="Avatar becomes a gear to Settings"
          note="Calmest row. Sign out and theme move into Settings → Account; nothing shows who is signed in."
          expanded={
            <>
              <NavPlaceholder />
              <FooterShell>
                <div className="flex items-center gap-1">
                  <OrgButton />
                  <IconButton>
                    <SettingsIcon />
                  </IconButton>
                </div>
              </FooterShell>
            </>
          }
          collapsed={
            <>
              <Brand />
              <div className="flex flex-col items-center gap-1">
                <IconButton>
                  <UsersRoundIcon />
                </IconButton>
                <IconButton>
                  <SettingsIcon />
                </IconButton>
              </div>
            </>
          }
        />

        <Variant
          id="C"
          title="Org row + account icon strip"
          note="Everything visible, no menu for the account. Two rows again, with theme, settings and sign out as buttons."
          expanded={
            <>
              <NavPlaceholder />
              <FooterShell>
                <OrgButton />
                <div className="border-border my-1 border-t" />
                <div className="flex items-center gap-1 px-1">
                  <Avatar />
                  <span className="flex-1" />
                  <IconButton>
                    <MoonIcon />
                  </IconButton>
                  <IconButton>
                    <SettingsIcon />
                  </IconButton>
                  <IconButton>
                    <LogOutIcon />
                  </IconButton>
                </div>
              </FooterShell>
            </>
          }
          collapsed={
            <>
              <Brand />
              <div className="flex flex-col items-center gap-1">
                <IconButton>
                  <UsersRoundIcon />
                </IconButton>
                <IconButton>
                  <Avatar />
                </IconButton>
                <IconButton>
                  <SettingsIcon />
                </IconButton>
              </div>
            </>
          }
        />

        <Variant
          id="D"
          title="Org as the header, slim account footer"
          note="Workspace-style: the org sits where the WATCHDOG mark is (mark moves into the header or drops). Footer is one slim row with avatar and a gear."
          expanded={
            <>
              <div className="border-border flex flex-col border-b p-2">
                <OrgButton />
              </div>
              <NavPlaceholder lines={4} />
              <FooterShell>
                <div className="flex items-center gap-1">
                  <Avatar />
                  <span className="text-muted-foreground min-w-0 flex-1 truncate px-1 text-xs">
                    E2E Investigator
                  </span>
                  <IconButton>
                    <SettingsIcon />
                  </IconButton>
                </div>
              </FooterShell>
            </>
          }
          collapsed={
            <>
              <IconButton>
                <UsersRoundIcon />
              </IconButton>
              <IconButton>
                <Avatar />
              </IconButton>
            </>
          }
        />

        <Variant
          id="F"
          title="A reversed: avatar left, org right"
          note="Same single row as A with the order flipped: the avatar leads and the org name takes the rest. Icon mode puts the avatar on top."
          expanded={
            <>
              <NavPlaceholder />
              <FooterShell>
                <div className="flex items-center gap-1">
                  <IconButton>
                    <Avatar />
                  </IconButton>
                  <OrgButton />
                </div>
              </FooterShell>
            </>
          }
          collapsed={
            <>
              <Brand />
              <div className="flex flex-col items-center gap-1">
                <IconButton>
                  <Avatar />
                </IconButton>
                <IconButton>
                  <UsersRoundIcon />
                </IconButton>
              </div>
            </>
          }
        />
      </div>
    </GuideSection>
  );
}
