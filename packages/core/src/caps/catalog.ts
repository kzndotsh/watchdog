import { Effect } from "effect";

import {
  listCapabilities,
  listPlaybookDescriptors,
  type CapDescriptor,
  type PlaybookDescriptor,
} from "@watchdog/caps";

export function listCapabilitiesEffect(): Effect.Effect<CapDescriptor[]> {
  return Effect.sync(() => listCapabilities());
}

export function listPlaybookDescriptorsEffect(): Effect.Effect<
  PlaybookDescriptor[]
> {
  return Effect.sync(() => listPlaybookDescriptors());
}
