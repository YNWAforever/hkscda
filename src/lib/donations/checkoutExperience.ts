import type { CheckoutExperience } from "./contracts";

const desktopCheckoutBreakpoint = 768;

export function checkoutExperienceFromViewport(viewportWidth: number): CheckoutExperience {
  return viewportWidth < desktopCheckoutBreakpoint ? "wap" : "desktop_qr";
}
