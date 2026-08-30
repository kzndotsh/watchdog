import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { JobPlaybookRunForm } from "@/domains/jobs/components/job-playbook-run-form";
import type { PlaybookListItem } from "@/domains/jobs/types";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/shared/ui/entity-combobox", () => ({
  EntityCombobox: () => null,
}));

const PLAYBOOK: PlaybookListItem = {
  id: "host-footprint-lite",
  title: "Host footprint lite",
  description: "DNS only",
  seedKinds: ["host"],
  steps: ["network.dns.lookup"],
  requires: {
    credentials: [],
    egress: "none",
    flags: [],
  },
};

describe("JobPlaybookRunForm", () => {
  it("renders playbook run chrome with Run disabled until seed is ready", () => {
    render(
      <JobPlaybookRunForm
        playbooks={[PLAYBOOK]}
        urlDumps={[]}
        entities={[]}
        allowThirdPartyEgress
        configuredCredentials={new Set()}
        onRunPlaybook={vi.fn()}
      />
    );

    expect(
      screen.getByRole("form", { name: "Run playbook" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Playbook filters" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Playbook")).toBeInTheDocument();
    expect(screen.getByLabelText("Seed host")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Playbook" })).toBeDisabled();
  });

  it("submits playbook seed values through onRunPlaybook", async () => {
    const onRunPlaybook = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <JobPlaybookRunForm
        playbooks={[PLAYBOOK]}
        urlDumps={[]}
        entities={[]}
        allowThirdPartyEgress
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
        entities={[]}
        allowThirdPartyEgress
        configuredCredentials={new Set()}
        runError="Playbook run failed"
        onRunPlaybook={vi.fn()}
      />
    );

    expect(screen.getByText("Playbook run failed")).toBeInTheDocument();
  });
});
