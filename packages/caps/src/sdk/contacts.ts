import type { CapContact } from "@watchdog/schemas/caps";

/**
 * How a Cap declares who it talks to (`contacts` on `defineCapability`). Authors write these
 * and nothing else about egress: the egress classes, the destinations a blocked step names and
 * the host list the declaration tests check all derive from them. A Cap with no network
 * contact declares `[]`.
 */
export const contact = {
  /**
   * A fixed host that receives Case data. Anonymous by default; `keyed: true` when the request
   * carries the operator's key. `redirects: "any_public"` when the host answers by redirecting
   * to hosts it cannot name in advance.
   */
  provider(
    host: string,
    options?: { keyed?: boolean; redirects?: "any_public" }
  ): CapContact {
    return {
      kind: "provider",
      host,
      access: options?.keyed === true ? "keyed" : "anonymous",
      ...(options?.redirects === undefined
        ? {}
        : { redirects: options.redirects }),
    };
  },
  /** A body-less GET of a fixed URL: nothing from the Case is part of the request. */
  download(url: string): CapContact {
    return { kind: "download", url };
  },
  /**
   * The host the input names. `via` is the transport (`http` by default). Over HTTP a redirect
   * hop may go to any public host; `anyHost: true` is for a Cap that makes one call per hop
   * (`web.url.unshorten`), so each hop's host is the first host of its own call.
   */
  target(
    via: "http" | "tls" | "dns" = "http",
    options?: { anyHost?: true }
  ): CapContact {
    return {
      kind: "target",
      via,
      ...(options?.anyHost === undefined ? {} : { anyHost: true as const }),
    };
  },
  /** DNS questions under a fixed zone: the name carries the seed to that zone's servers. */
  dnsZone(zone: string): CapContact {
    return { kind: "dns", zone };
  },
  /** The configured AI model endpoint. */
  model(): CapContact {
    return { kind: "model" };
  },
} as const;
