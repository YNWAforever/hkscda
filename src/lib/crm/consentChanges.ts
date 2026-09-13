import type { ConsentStatus } from "./types";
type Channels = { email: ConsentStatus | null; whatsapp: ConsentStatus | null };
export function consentChanges(
  previous: Channels,
  next: Channels,
): { email?: boolean; whatsapp?: boolean } {
  const changed: { email?: boolean; whatsapp?: boolean } = {};
  for (const channel of ["email", "whatsapp"] as const) {
    if (next[channel] !== null && next[channel] !== previous[channel])
      changed[channel] = next[channel] === "opt_in";
  }
  return changed;
}
