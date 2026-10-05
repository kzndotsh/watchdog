import { afterAll, afterEach, beforeAll } from "vitest";

import { mockServer } from "./mock-server";

beforeAll(() => {
  mockServer.listen({ onUnhandledFrame: "bypass" });
});

afterEach(() => {
  mockServer.resetHandlers();
});

afterAll(() => {
  mockServer.close();
});
