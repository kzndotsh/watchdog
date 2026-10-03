import {
  dehydrate,
  hydrate,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { warmEnsureQueryData } from "@/shared/lib/warm-query";

const options = {
  queryKey: ["warm-hydration"],
  queryFn: async () => Promise.resolve(["ada"]),
  staleTime: 60_000,
};

function Probe() {
  const query = useQuery(options);
  return <p>{query.data ? query.data.join(",") : "loading"}</p>;
}

function Tree({ client }: { client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>
  );
}

describe("loader warm queries and hydration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates without a mismatch when a warmed query settles after the server render", async () => {
    // Server: the loader warms a list without awaiting it, then renders.
    const serverClient = new QueryClient();
    vi.stubGlobal("window", undefined);
    warmEnsureQueryData(serverClient, options);
    vi.unstubAllGlobals();
    const serverHtml = renderToString(<Tree client={serverClient} />);
    expect(serverHtml).toContain("loading");

    // The warm settles after the render and is streamed with the page (a slow
    // client boot sees it in the cache before the first hydration render).
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    const clientClient = new QueryClient();
    hydrate(clientClient, dehydrate(serverClient));

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.append(container);
    const recoverable: string[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Tree client={clientClient} />, {
        onRecoverableError: (error) => {
          recoverable.push(String(error));
        },
      });
    });

    expect(recoverable).toEqual([]);
    await waitFor(() => {
      expect(container.textContent).toBe("ada");
    });

    act(() => {
      root?.unmount();
    });
    container.remove();
  });
});
