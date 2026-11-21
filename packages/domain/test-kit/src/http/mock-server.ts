import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export { http, HttpResponse };
export const mockServer = setupServer();

type JsonBody = Parameters<typeof HttpResponse.json>[0];

export function mockJson(
  url: string | RegExp,
  body: JsonBody,
  opts?: { status?: number; method?: "get" | "post" | "put" | "patch" }
): void {
  const method = opts?.method ?? "get";
  const status = opts?.status ?? 200;
  const resolver = () => HttpResponse.json(body, { status });
  switch (method) {
    case "get": {
      mockServer.use(http.get(url, resolver));
      return;
    }
    case "post": {
      mockServer.use(http.post(url, resolver));
      return;
    }
    case "put": {
      mockServer.use(http.put(url, resolver));
      return;
    }
    case "patch": {
      mockServer.use(http.patch(url, resolver));
      return;
    }
    default: {
      const _exhaustive: never = method;
      throw new Error(
        `Unhandled mockJson method: ${JSON.stringify(_exhaustive)}`
      );
    }
  }
}
