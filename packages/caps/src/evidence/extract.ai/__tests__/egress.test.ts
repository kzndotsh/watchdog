import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

import { createCapRunHarness, createRecordedRun } from "../../../testing";
import { extractAi } from "../cap.ts";

const PRIVATE_ORIGIN = "http://127.0.0.1:8080";
const MODEL_TEXT = JSON.stringify({
  identifiers: [{ type: "email", value: "alice@example.com" }],
  claims: [],
  questions: [],
  summary: "one email",
});
const COMPLETION = JSON.stringify({
  id: "cmpl-1",
  object: "chat.completion",
  created: 1,
  model: "default",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: MODEL_TEXT },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
});

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The network boundary the suite mocks: what the model endpoint would answer. */
function stubModelEndpoint(respond: (url: string) => Response) {
  const fetch = vi.fn(async (input: string | URL | Request) =>
    respond(new URL(input instanceof Request ? input.url : input).href)
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function harnessWith(secrets: Record<string, string>) {
  return createCapRunHarness({
    secrets,
    evidenceSnapshot: {
      evidenceId: testId(40),
      caseId: testCaseId(10),
      kind: "attestation",
      text: "Contact alice@example.com about the invoice",
      packedAt: "2026-01-01T00:00:00.000Z",
      packerVersion: 1,
    },
    input: { evidenceId: testId(40) },
  });
}

describe("evidence.extract.ai goes through the Job's model door", () => {
  it("records the call to an allowlisted private origin, response by hash only", async () => {
    const fetch = stubModelEndpoint(
      () =>
        new Response(COMPLETION, {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    const recorded = createRecordedRun({ privateAiOrigins: [PRIVATE_ORIGIN] });
    const harness = harnessWith({ AI_COMPAT_API_KEY: "local-key-12345" });

    const result = await recorded.run(extractAi.run(harness.ctx));

    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [call, ...rest] = recorded.recordedCalls();
    expect(rest).toEqual([]);
    expect(call).toMatchObject({
      transport: "http",
      method: "POST",
      // No base URL set: the default local model address, named as it is.
      url: `${PRIVATE_ORIGIN}/v1/chat/completions`,
      outcome: "response",
      status: 200,
      body: {
        state: "hashed",
        reason: "hash_only",
        sha256: sha256(COMPLETION),
        bytes: Buffer.byteLength(COMPLETION),
      },
    });
    expect(call?.body).not.toHaveProperty("data");
    expect(call?.requestBody.state).toBe("hashed");
  });

  it("names the real destination of a configured base URL (config, not a secret)", async () => {
    stubModelEndpoint(() => new Response(COMPLETION, { status: 200 }));
    const recorded = createRecordedRun({
      privateAiOrigins: ["http://10.1.2.3:9000"],
    });
    const harness = harnessWith({
      AI_COMPAT_API_KEY: "local-key-12345",
      AI_COMPAT_BASE_URL: "http://10.1.2.3:9000/v1",
    });

    await recorded.run(extractAi.run(harness.ctx));

    expect(recorded.recordedCalls()[0]?.url).toBe(
      "http://10.1.2.3:9000/v1/chat/completions"
    );
  });

  it("refuses a private origin the operator did not list, before any request", async () => {
    const fetch = stubModelEndpoint(() => new Response(COMPLETION));
    const recorded = createRecordedRun({ privateAiOrigins: [PRIVATE_ORIGIN] });
    const harness = harnessWith({
      AI_COMPAT_API_KEY: "local-key-12345",
      AI_COMPAT_BASE_URL: "http://169.254.169.254/latest",
    });

    const failure: unknown = await recorded
      .run(extractAi.run(harness.ctx))
      .then(
        () => undefined,
        (error: unknown) => error
      );

    expect(failure).toMatchObject({
      _tag: "BlockedTargetError",
      reason: "ai_origin",
    });
    expect(failure instanceof Error ? failure.message : "").not.toMatch(
      /169\.254/
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(recorded.recordedCalls()).toEqual([]);
  });

  it("refuses a loopback origin when the operator allowlist is empty", async () => {
    const fetch = stubModelEndpoint(() => new Response(COMPLETION));
    const recorded = createRecordedRun();
    const harness = harnessWith({ AI_COMPAT_API_KEY: "local-key-12345" });

    await expect(
      recorded.run(extractAi.run(harness.ctx))
    ).rejects.toMatchObject({
      reason: "ai_origin",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a redirect from the model endpoint and does not follow it", async () => {
    const fetch = stubModelEndpoint(
      () =>
        new Response(null, {
          status: 307,
          headers: { location: "http://169.254.169.254/steal" },
        })
    );
    const recorded = createRecordedRun({ privateAiOrigins: [PRIVATE_ORIGIN] });
    const harness = harnessWith({ AI_COMPAT_API_KEY: "local-key-12345" });

    await expect(recorded.run(extractAi.run(harness.ctx))).rejects.toThrow();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [call] = recorded.recordedCalls();
    expect(call).toMatchObject({
      outcome: "failed",
      failure: { tag: "BlockedTargetError", reason: "redirect" },
    });
    expect(JSON.stringify(call)).not.toContain("169.254");
  });

  it("sends an Anthropic key to the fixed Anthropic host through the shared client", async () => {
    const fetch = stubModelEndpoint(
      () => new Response('{"error":"bad request"}', { status: 400 })
    );
    const recorded = createRecordedRun();
    const harness = harnessWith({ ANTHROPIC_API_KEY: "sk-ant-test-123456" });

    await expect(recorded.run(extractAi.run(harness.ctx))).rejects.toThrow();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [call] = recorded.recordedCalls();
    expect(call).toMatchObject({
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      status: 400,
      body: { state: "hashed", reason: "hash_only" },
    });
  });
});
