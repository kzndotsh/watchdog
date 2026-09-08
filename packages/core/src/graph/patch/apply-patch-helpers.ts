import { Effect } from "effect";

import {
  requireEnum as requireEnumPolicy,
  requireEntitySlug as requireEntitySlugPolicy,
  requireString as requireStringPolicy,
  requireUuid as requireUuidPolicy,
} from "@watchdog/policy";
import type { JsonValue } from "@watchdog/schemas";

import { errorMessage } from "../../infra/domain-error";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";

export function requireDomainStringEffect(
  data: Record<string, JsonValue>,
  key: string
): Effect.Effect<string, DomainTag> {
  return Effect.try({
    try: () => requireStringPolicy(data, key),
    catch: (error) =>
      new InvalidError({ reason: errorMessage(error, "invalid") }),
  });
}

export function requireDomainUuidEffect(
  data: Record<string, JsonValue>,
  key: string
): Effect.Effect<string, DomainTag> {
  return Effect.try({
    try: () => requireUuidPolicy(data, key),
    catch: (error) =>
      new InvalidError({ reason: errorMessage(error, "invalid") }),
  });
}

export function requireDomainEnumEffect<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string
): Effect.Effect<T, DomainTag> {
  return Effect.try({
    try: () => requireEnumPolicy(value, allowed, label),
    catch: (error) =>
      new InvalidError({ reason: errorMessage(error, "invalid") }),
  });
}

export function requireDomainEntitySlugEffect(
  data: Record<string, JsonValue>
): Effect.Effect<string, DomainTag> {
  return Effect.try({
    try: () => requireEntitySlugPolicy(data),
    catch: (error) =>
      new InvalidError({ reason: errorMessage(error, "invalid") }),
  });
}
