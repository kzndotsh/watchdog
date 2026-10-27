import { render as baseRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CaseEgress } from "@/domains/cases/types";
import { JobPlaybookRunForm } from "@/domains/jobs/components/job-playbook-run-form";
import type { PlaybookListItem } from "@/domains/jobs/types";
import {
  emptyEntityPickerPort,
  pickerTestWrapper,
} from "@/testing/memory-picker-port";
import { testCaseId } from "@watchdog/schemas/testing";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/shared/ui/entity-combobox", () => ({
  EntityCombobox: () => null,
}));

const CASE_EGRESS = {
  id: testCaseId(1),
  slug: "alpha",
  allowedEgress: [
    "local",
    "target",
    "public_lookup",
    "account_lookup",
    "model",
  ],
} satisfies CaseEgress;

const PLAYBOOK: PlaybookListItem = {
  id: "host-footprint-lite",
  title: "Host footprint lite",
  description: "DNS only",
  seedKinds: ["host"],
  steps: ["network.dns.lookup"],
  stepDependencies: [[]],
  requires: {
    credentials: [],
    egress: ["local"],
    contacts: [],
    flags: [],
  },
};

const URL_PLAYBOOK: PlaybookListItem = {
  ...PLAYBOOK,
  id: "url-reputation",
  title: "URL reputation",
  seedKinds: ["url"],
};

function render(ui: ReactElement) {
  return baseRender(ui, { wrapper: pickerTestWrapper() });
}

describe("JobPlaybookRunForm", () => {
  it("renders playbook run chrome with Run disabled until seed is ready", () => {
    render(
      <JobPlaybookRunForm
        playbooks={[PLAYBOOK]}
        urlDumps={[]}
        entityPort={emptyEntityPickerPort()}
        caseEgress={CASE_EGRESS}
        configuredCredentials={new Set()}
        onRunPlaybook={vi.fn()}
      />
    );

    expect(
      screen.getByRole("form", { name: "Run playbook" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByLabelText("Playbook")).toBeInTheDocument();
    expect(screen.getByLabelText("Seed host")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Playbook" })).toBeDisabled();
  });

  it("narrows the Playbooks from the standard Filters popover, and the form follows", async () => {
    const user = userEvent.setup();
    render(
      <JobPlaybookRunForm
        playbooks={[PLAYBOOK, URL_PLAYBOOK]}
        urlDumps={[]}
        entityPort={emptyEntityPickerPort()}
        caseEgress={CASE_EGRESS}
        configuredCredentials={new Set()}
        onRunPlaybook={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Seed host")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    // Seed is the first declared filter.
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Seed values" }));
    await user.click(await screen.findByRole("option", { name: "URL" }));

    // Only the URL Playbook is left, so the form no longer asks for a host.
    await waitFor(() => {
      expect(screen.queryByLabelText("Seed host")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("group", { name: "Active filters", hidden: true })
    ).toHaveTextContent("Seed: URL");
  });

  it("submits playbook seed values through onRunPlaybook", async () => {
    const onRunPlaybook = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <JobPlaybookRunForm
        playbooks={[PLAYBOOK]}
        urlDumps={[]}
        entityPort={emptyEntityPickerPort()}
        caseEgress={CASE_EGRESS}
        configuredCredentials={new Set()}
        onRunPlaybook={onRunPlaybook}
      />
    );

    await user.type(screen.getByLabelText("Seed host"), "mailhost.test");
    await user.click(screen.getByRole("button", { name: "Run Playbook" }));

    expect(onRunPlaybook).toHaveBeenCalledWith(
      expect.objectContaining({
        playbookId: "host-footprint-lite",
        host: "mailhost.test",
      })
    );
  });

  it("shows run errors from the parent", () => {
    render(
      <JobPlaybookRunForm
        playbooks={[PLAYBOOK]}
        urlDumps={[]}
        entityPort={emptyEntityPickerPort()}
        caseEgress={CASE_EGRESS}
        configuredCredentials={new Set()}
        runError="Playbook run failed"
        onRunPlaybook={vi.fn()}
      />
    );

    expect(screen.getByText("Playbook run failed")).toBeInTheDocument();
  });
});
