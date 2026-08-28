import { createServerFn } from "@tanstack/react-start";

export const getAdoptionImpactReport = createServerFn({ method: "GET" }).handler(async () => {
  const { loadAdoptionImpactReport } = await import("./publicImpact.server");
  return loadAdoptionImpactReport(new Date());
});
