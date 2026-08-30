import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlaybookSelect } from "@/domains/jobs/components/playbook-select";
import type { PlaybookListItem } from "@/domains/jobs/types";

const HOST_PLAYBOOK: PlaybookListItem = {
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

const URL_PLAYBOOK: PlaybookListItem = {
  id: "url-reputation",
  title: "URL reputation",
  description: "Check URL reputation",
  seedKinds: ["url"],
  steps: ["web.url.reputation"],
  requires: {
    credentials: [],
    egress: "third_party",
    flags: [],
  },
};

describe("PlaybookSelect", () => {
  it("renders the selected playbook title in the combobox", () => {
    render(
      <PlaybookSelect
        playbooks={[HOST_PLAYBOOK, URL_PLAYBOOK]}
        value="host-footprint-lite"
        onValueChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("combobox", { name: "Playbook" })
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Host footprint lite")).toBeInTheDocument();
  });

  it("selects a playbook from the grouped list", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PlaybookSelect
        playbooks={[HOST_PLAYBOOK, URL_PLAYBOOK]}
        value=""
        onValueChange={onValueChange}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Playbook" }));
    await user.click(screen.getByRole("option", { name: "URL reputation" }));

    expect(onValueChange).toHaveBeenCalledWith("url-reputation");
  });

  it("shows playbook metadata in the preview panel", async () => {
    const user = userEvent.setup();

    render(
      <PlaybookSelect
        playbooks={[HOST_PLAYBOOK, URL_PLAYBOOK]}
        value="host-footprint-lite"
        onValueChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Playbook" }));

    expect(screen.getByText("DNS only")).toBeInTheDocument();
    expect(screen.getByText("host-footprint-lite")).toBeInTheDocument();
    expect(screen.getByText("network.dns.lookup")).toBeInTheDocument();
  });
});
