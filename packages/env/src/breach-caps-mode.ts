import { z } from "zod";

/** The values of `WD_BREACH_CAPS`, least to most exposed. */
export const BREACH_CAPS_MODES = ["off", "safe", "full"] as const;

export type BreachCapsMode = (typeof BREACH_CAPS_MODES)[number];

/** `WD_BREACH_CAPS`: one of the three modes, default `off`; anything else is rejected at startup. */
export const breachCapsModeSchema = z
  .enum(BREACH_CAPS_MODES, {
    error: "WD_BREACH_CAPS must be off, safe or full",
  })
  .default("off");
