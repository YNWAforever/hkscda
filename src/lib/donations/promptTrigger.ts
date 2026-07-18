import type { DonationTrigger } from "./contracts";

export type PromptTriggerState = {
  visible: boolean;
  dismissed: boolean;
  trigger?: DonationTrigger;
};

export type PromptTriggerEvent =
  | { type: "qualify"; trigger: DonationTrigger }
  | { type: "dismiss" }
  | { type: "reset"; dismissed: boolean };

export const initialPromptTriggerState: PromptTriggerState = {
  visible: false,
  dismissed: false,
};

export function reducePromptTrigger(
  state: PromptTriggerState,
  event: PromptTriggerEvent,
): PromptTriggerState {
  if (event.type === "reset") {
    return { visible: false, dismissed: event.dismissed };
  }

  if (event.type === "dismiss") {
    return { visible: false, dismissed: true };
  }

  if (state.dismissed || state.visible) return state;

  return { visible: true, dismissed: false, trigger: event.trigger };
}

export function scrollProgress(input: {
  scrollY: number;
  scrollHeight: number;
  viewportHeight: number;
}) {
  const range = input.scrollHeight - input.viewportHeight;
  return range <= 0 ? 0 : Math.min(1, Math.max(0, input.scrollY / range));
}
