import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolver } = vi.hoisted(() => ({
  mockResolver: {
    cancel: vi.fn(),
    resolve4: vi.fn(),
    resolveTxt: vi.fn(),
  },
}));

vi.mock("node:dns/promises", () => ({
  Resolver: function Resolver() {
    return mockResolver;
  },
}));

import { BlockedTargetError } from "../../errors/tagged-errors";
import { makeJobEgress } from "../egress";
import {
  assertNameAdmitted,
  egressPolicyFor,
  type PolicyContact,
} from "../egress-policy";
import { closePlain, harness, listenPlain } from "./helpers/loopback-server";

vi.unmock("undici");

const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => {
  for (const fn of Object.values(mockResolver)) fn.mockReset();
});
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

type Served = { readonly port: number; readonly hits: string[] };

/** A loopback server that records each request path and answers with `respond`. */
async function serve(
  respond: (path: string) => { status: number; location?: string }
): Promise<Served> {
  const hits: string[] = [];
  const { server, port } = await listenPlain((req, res) => {
    const path = req.url ?? "/";
    hits.push(path);
    const { status, location } = respond(path);
    res.writeHead(status, location === undefined ? {} : { location });
    res.end("ok");
  });
  cleanups.push(async () => closePlain(server));
  return { port, hits };
}

function jobFor(contacts: readonly PolicyContact[], input: unknown = {}) {
  const { fetch, fetchPrivateOrigin } = harness();
  return makeJobEgress(
    { fetch, fetchPrivateOrigin },
    { policy: egressPolicyFor(contacts, input) }
  );
}

const provider = (host: string, redirects?: "any_public"): PolicyContact => ({
  kind: "provider",
  host,
  ...(redirects === undefined ? {} : { redirects }),
});

/** The refusal a call ended with, and that it never named its target. */
async function refusal(
  call: Promise<unknown>,
  ...forbidden: string[]
): Promise<string | undefined> {
  const error = await call.then(
    () => undefined,
    (error: unknown) => error
  );
  expect(error).toBeInstanceOf(BlockedTargetError);
  if (!(error instanceof BlockedTargetError)) return undefined;
  for (const text of forbidden) expect(error.message).not.toContain(text);
  return error.reason;
}

describe("a provider contact", () => {
  it("admits its own host and refuses another, recording the refusal as a failed call", async () => {
    const { port, hits } = await serve(() => ({ status: 200 }));
    const { egress, ledger } = jobFor([provider("other.test")]);

    const reason = await refusal(
      egress.fetch(`http://public.test:${port}/lookup?q=secret-seed`),
      "public.test",
      "secret-seed"
    );

    expect(reason).toBe("undeclared");
    expect(hits).toEqual([]);
    const [call] = ledger.drain();
    expect(call).toMatchObject({
      outcome: "failed",
      failure: { tag: "BlockedTargetError", reason: "undeclared" },
    });
    expect(JSON.stringify(call?.failure)).not.toContain("public.test");

    const admitted = jobFor([provider("public.test")]);
    await (
      await admitted.egress.fetch(`http://public.test:${port}/lookup`)
    ).text();
    expect(hits).toEqual(["/lookup"]);
  });

  it("refuses an undeclared host on a redirect hop", async () => {
    const { port, hits } = await serve((path) =>
      path === "/start"
        ? { status: 302, location: `http://empty.test:${port}/next` }
        : { status: 200 }
    );
    const { egress, ledger } = jobFor([provider("public.test")]);

    const reason = await refusal(
      egress.fetch(`http://public.test:${port}/start`),
      "empty.test"
    );

    expect(reason).toBe("undeclared");
    expect(hits).toEqual(["/start"]);
    const [call] = ledger.drain();
    expect(call?.hops.map((hop) => hop.status)).toEqual([302, null]);
    expect(call?.failure?.reason).toBe("undeclared");
  });

  it("admits any host on a redirect hop with redirects any_public, still behind the address guard", async () => {
    const { port } = await serve((path) =>
      path === "/start"
        ? { status: 302, location: `http://internal.test:${port}/next` }
        : { status: 200 }
    );
    const { egress } = jobFor([provider("public.test", "any_public")]);

    const reason = await refusal(
      egress.fetch(`http://public.test:${port}/start`)
    );

    // Not `undeclared`: the declaration admitted the hop and the SSRF guard refused it.
    expect(reason).toBe("resolved");
  });
});

describe("a target contact", () => {
  const target: PolicyContact = { kind: "target", via: "http" };

  it("admits the host the input names and refuses another at the first hop", async () => {
    const { port, hits } = await serve(() => ({ status: 200 }));
    const input = { url: `https://public.test:${port}/page` };
    const { egress } = jobFor([target], input);

    await (await egress.fetch(`http://public.test:${port}/page`)).text();
    expect(hits).toEqual(["/page"]);

    expect(await refusal(egress.fetch(`http://empty.test:${port}/page`))).toBe(
      "undeclared"
    );
    expect(hits).toEqual(["/page"]);
  });

  it("admits a redirect to another host, still behind the address guard", async () => {
    const { port } = await serve(() => ({
      status: 302,
      location: `http://internal.test:${port}/next`,
    }));
    const { egress } = jobFor([target], { host: "public.test" });

    expect(
      await refusal(egress.fetch(`http://public.test:${port}/start`))
    ).toBe("resolved");
  });

  it("admits any first host with anyHost", async () => {
    const { port, hits } = await serve(() => ({ status: 200 }));
    const { egress } = jobFor([{ ...target, anyHost: true }], {
      url: "https://elsewhere.example/",
    });

    await (await egress.fetch(`http://public.test:${port}/hop`)).text();

    expect(hits).toEqual(["/hop"]);
  });
});

describe("a download contact", () => {
  const url = (port: number) => `http://public.test:${port}/feed/list.txt`;
  const download = (port: number): PolicyContact => ({
    kind: "download",
    url: url(port),
  });
  const input = { ip: "203.0.113.77", note: "Ada Lovelace" };

  it("admits a body-less GET of exactly its URL", async () => {
    const { port, hits } = await serve(() => ({ status: 200 }));
    const { egress } = jobFor([download(port)], input);

    await (await egress.fetch(url(port))).text();
    await (await egress.fetch(url(port), { method: "GET" })).text();

    expect(hits).toEqual(["/feed/list.txt", "/feed/list.txt"]);
  });

  const refused: readonly {
    readonly name: string;
    readonly suffix?: string;
    readonly path?: string;
    readonly init?: RequestInit;
  }[] = [
    { name: "a query on the declared URL", suffix: "?q=203.0.113.77" },
    {
      name: "a seed in the query, percent-encoded",
      suffix: "?who=Ada%20Lovelace",
    },
    { name: "another path on the host", path: "/feed/other.txt" },
    { name: "a POST", init: { method: "POST" } },
    { name: "a HEAD", init: { method: "HEAD" } },
    { name: "a GET with a body", init: { method: "GET", body: "x" } },
    {
      name: "a seed in a header",
      init: { headers: { "x-trace": "ip=203.0.113.77" } },
    },
    {
      name: "a seed in a header, in another case",
      init: { headers: { referer: "https://x.test/ada lovelace" } },
    },
  ];

  it.each(refused)("refuses $name with reason seed", async (attempt) => {
    const { port, hits } = await serve(() => ({ status: 200 }));
    const { egress, ledger } = jobFor([download(port)], input);
    const target =
      attempt.path === undefined
        ? `${url(port)}${attempt.suffix ?? ""}`
        : `http://public.test:${port}${attempt.path}`;

    const reason = await refusal(
      egress.fetch(target, attempt.init),
      "203.0.113.77",
      "Lovelace"
    );

    expect(reason).toBe("seed");
    expect(hits).toEqual([]);
    expect(ledger.drain()[0]?.failure?.reason).toBe("seed");
  });

  it("refuses a host no contact declares as undeclared, not as a seed", async () => {
    const { port } = await serve(() => ({ status: 200 }));
    const { egress } = jobFor([download(port)], input);

    expect(
      await refusal(egress.fetch(`http://empty.test:${port}/feed/list.txt`))
    ).toBe("undeclared");
  });

  it("does not scan for values too short to mean anything", async () => {
    const { port } = await serve(() => ({ status: 200 }));
    const { egress } = jobFor([download(port)], { limit: 10, name: "ab" });

    await (
      await egress.fetch(url(port), { headers: { "x-limit": "10 ab" } })
    ).text();
  });
});

describe("DNS under the policy", () => {
  const zone: PolicyContact = { kind: "dns", zone: "origin.asn.cymru.com" };

  it("admits a name in the declared zone and refuses one outside it", async () => {
    mockResolver.resolveTxt.mockResolvedValueOnce([["15169 | US"]]);
    const { egress, ledger } = jobFor([zone], { ip: "9.9.9.9" });

    await Effect.runPromise(
      egress.resolve(
        { type: "TXT", name: "9.9.9.9.origin.asn.cymru.com" },
        new AbortController().signal
      )
    );
    const exit = await Effect.runPromiseExit(
      egress.resolve(
        { type: "TXT", name: "secret-seed.elsewhere.test" },
        new AbortController().signal
      )
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(mockResolver.resolveTxt).toHaveBeenCalledTimes(1);
    const calls = ledger.drain();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      transport: "dns",
      outcome: "failed",
      failure: { tag: "BlockedTargetError", reason: "undeclared" },
    });
    expect(JSON.stringify(exit)).not.toContain("elsewhere.test");
  });

  it("keeps a DNS target on the input's name and the names under it", async () => {
    mockResolver.resolve4.mockResolvedValue(["93.184.216.34"]);
    const { egress } = jobFor([{ kind: "target", via: "dns" }], {
      domain: "Subject.Test",
    });
    const ask = async (name: string) =>
      Effect.runPromiseExit(
        egress.resolve({ type: "A", name }, new AbortController().signal)
      );

    expect(Exit.isSuccess(await ask("subject.test"))).toBe(true);
    expect(Exit.isSuccess(await ask("_dmarc.subject.test."))).toBe(true);
    expect(Exit.isFailure(await ask("other.test"))).toBe(true);
    expect(Exit.isFailure(await ask("notsubject.test"))).toBe(true);
  });

  it("does not let an HTTP contact admit a DNS name", () => {
    const policy = egressPolicyFor([provider("public.test")], {});
    expect(() => {
      assertNameAdmitted(policy, "dns", "public.test");
    }).toThrow(BlockedTargetError);
  });
});

describe("TLS under the policy", () => {
  it("admits the input's name over a tls target and refuses another", () => {
    const policy = egressPolicyFor([{ kind: "target", via: "tls" }], {
      host: "subject.test",
    });
    expect(() => {
      assertNameAdmitted(policy, "tls", "subject.test");
    }).not.toThrow();
    expect(() => {
      assertNameAdmitted(policy, "tls", "elsewhere.test");
    }).toThrow(BlockedTargetError);
  });
});

describe("an Egress without a policy", () => {
  it("refuses nothing on declaration grounds", async () => {
    const { port, hits } = await serve(() => ({ status: 200 }));
    const { fetch, fetchPrivateOrigin } = harness();
    const { egress } = makeJobEgress({ fetch, fetchPrivateOrigin });

    await (await egress.fetch(`http://public.test:${port}/any`)).text();

    expect(hits).toEqual(["/any"]);
  });
});
