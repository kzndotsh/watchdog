import { createFileRoute } from "@tanstack/react-router";

import { GuideToc } from "@/routes/_protected/ui/-guide-chrome";
import { AtomsSection } from "@/routes/_protected/ui/-section-atoms";
import { FoundationsSection } from "@/routes/_protected/ui/-section-foundations";
import { SidebarFooterSection } from "@/routes/_protected/ui/-section-sidebar-footer";
import { TaskCardsSection } from "@/routes/_protected/ui/-section-task-cards";
import { Page, PageHeader } from "@/shared/layout/page";

function StyleGuidePage() {
  return (
    <Page density="default" className="pb-12">
      <PageHeader />
      <GuideToc />

      <div className="flex min-w-0 flex-col gap-10">
        <FoundationsSection />
        <AtomsSection />
        <SidebarFooterSection />
        <TaskCardsSection />
      </div>
    </Page>
  );
}

export const Route = createFileRoute("/_protected/ui/")({
  component: StyleGuidePage,
});
