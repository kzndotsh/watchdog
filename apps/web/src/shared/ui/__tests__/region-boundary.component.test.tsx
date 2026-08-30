import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { RegionBoundary } from "@/shared/ui/region-boundary";
import { StackBodySkeleton } from "@/shared/ui/skeletons";

function ThrowOnRender({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("region failed");
  return <div>Region ok</div>;
}

function SuspenseChild({ delayMs }: { delayMs: number }) {
  const query = useQuery({
    queryKey: ["region-boundary-test", delayMs],
    queryFn: async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
      return "done";
    },
    staleTime: Infinity,
  });
  if (query.isLoading) throw new Promise(() => {});
  return <div>{query.data}</div>;
}

describe("RegionBoundary", () => {
  it("keeps sibling regions mounted when one region errors", async () => {
    const user = userEvent.setup();

    function Page() {
      const [leftThrows, setLeftThrows] = useState(true);
      return (
        <div>
          <RegionBoundary fallback={<StackBodySkeleton sections={1} />}>
            <ThrowOnRender shouldThrow={leftThrows} />
          </RegionBoundary>
          <div data-testid="sibling">Sibling mounted</div>
          <button
            type="button"
            onClick={() => {
              setLeftThrows(false);
            }}
          >
            Fix left
          </button>
        </div>
      );
    }

    render(<Page />);

    expect(screen.getByText("region failed")).toBeInTheDocument();
    expect(screen.getByTestId("sibling")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("region failed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fix left" }));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Region ok")).toBeInTheDocument();
    expect(screen.getByTestId("sibling")).toBeInTheDocument();
  });

  it("shows fallback while suspense child is pending", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <RegionBoundary fallback={<div>Loading region</div>}>
          <SuspenseChild delayMs={50} />
        </RegionBoundary>
      </QueryClientProvider>
    );

    expect(screen.getByText("Loading region")).toBeInTheDocument();
  });
});
