import type { CapContact } from "@watchdog/schemas/caps";
import { downloadHost } from "@watchdog/schemas/caps";
import type { ProviderCall } from "@watchdog/tools/http";

/** A host or DNS name a recorded call touched, and where in its call it was. */
export type TouchedHost = {
  readonly transport: ProviderCall["transport"];
  readonly host: string;
  /** 0 for the host the call was made to; later hops are redirect targets. */
  readonly hop: number;
};

/** What a declaration test knows about the run, beyond the Cap's own contacts. */
export type DeclarationRun = {
  /** The host the input names: `target` contacts admit it (DNS and TLS also its subdomains). */
  targetHost?: string;
  /** `target` contacts over HTTP admit any host, for a Cap that makes one call per redirect hop. */
  anyTargetHost?: boolean;
  /** The model endpoint's host, which a `model` contact admits. */
  modelHost?: string;
};

function normalize(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

/** Every host or name a call touched: each HTTP hop, the DNS name asked, the TLS peer. */
export function touchedHosts(call: ProviderCall): TouchedHost[] {
  switch (call.transport) {
    case "dns": {
      // `dns:<name>?type=<rrtype>`
      const name = call.url.slice("dns:".length).split("?")[0] ?? "";
      return [{ transport: "dns", host: normalize(name), hop: 0 }];
    }
    case "tls": {
      return [
        {
          transport: "tls",
          host: normalize(new URL(call.url).hostname),
          hop: 0,
        },
      ];
    }
    case "http": {
      return call.hops.map((hop, index) => ({
        transport: "http" as const,
        host: normalize(new URL(hop.url).hostname),
        hop: index,
      }));
    }
    default: {
      call.transport satisfies never;
      return [];
    }
  }
}

function inZone(name: string, zone: string): boolean {
  const z = normalize(zone);
  return name === z || name.endsWith(`.${z}`);
}

function admits(
  contact: CapContact,
  touched: TouchedHost,
  run: DeclarationRun
): boolean {
  const target =
    run.targetHost === undefined ? undefined : normalize(run.targetHost);
  switch (contact.kind) {
    case "provider": {
      return (
        touched.transport === "http" &&
        (normalize(contact.host) === touched.host ||
          (contact.redirects === "any_public" && touched.hop > 0))
      );
    }
    case "download": {
      return (
        touched.transport === "http" &&
        normalize(downloadHost(contact)) === touched.host
      );
    }
    case "target": {
      if (target === undefined) return false;
      if (contact.via === "http") {
        return (
          touched.transport === "http" &&
          (run.anyTargetHost === true ||
            touched.hop > 0 ||
            touched.host === target)
        );
      }
      return touched.transport === contact.via && inZone(touched.host, target);
    }
    case "dns": {
      return touched.transport === "dns" && inZone(touched.host, contact.zone);
    }
    case "model": {
      return (
        touched.transport === "http" &&
        run.modelHost !== undefined &&
        touched.host === normalize(run.modelHost)
      );
    }
    default: {
      contact satisfies never;
      return false;
    }
  }
}

/**
 * The contacts no call used, so a declaration that outlives the host it named (a vendor
 * dropped, a zone renamed) is caught as well as a host nobody declared.
 */
export function unusedContacts(
  contacts: readonly CapContact[],
  calls: readonly ProviderCall[],
  run: DeclarationRun = {}
): CapContact[] {
  return contacts.filter(
    (contact) =>
      !calls.some((call) =>
        touchedHosts(call).some((touched) => admits(contact, touched, run))
      )
  );
}

/**
 * The hosts the calls touched that no contact admits, as `transport host` strings (empty when
 * every touched host is declared). The rules, per contact kind:
 * - `provider`: its host, over HTTP (a redirect hop too when `redirects: "any_public"`).
 * - `download`: the URL's host.
 * - `target`: over HTTP the input's host, and any redirect hop; over TLS or DNS the input's
 *   name or a name under it (`_dmarc.<host>`).
 * - `dns`: a name in the zone.
 * - `model`: the model endpoint's host.
 */
export function undeclaredHosts(
  contacts: readonly CapContact[],
  calls: readonly ProviderCall[],
  run: DeclarationRun = {}
): string[] {
  const out = new Set<string>();
  for (const call of calls) {
    for (const touched of touchedHosts(call)) {
      if (!contacts.some((contact) => admits(contact, touched, run))) {
        out.add(`${touched.transport} ${touched.host}`);
      }
    }
  }
  return [...out];
}
