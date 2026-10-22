import { defineProvider } from "../sdk";

/** The Commercial Terms permit powering products and services offered to the customer's own customers. The Cap can instead use an operator-chosen OpenAI-compatible endpoint, whose terms are the operator's. */
export const anthropic = defineProvider({
  name: "Anthropic",
  url: "https://www.anthropic.com",
  termsUrl: "https://www.anthropic.com/legal/commercial-terms",
  tier: "paid",
  commercialUse: "allowed",
});
