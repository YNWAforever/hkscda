import { createFileRoute } from "@tanstack/react-router";
import {
  checkReadiness,
  createReadinessDeps,
  createReadinessHandler,
} from "../../../lib/operations/readiness.server";

const handleReadiness = createReadinessHandler({
  secret: () => process.env.CRON_SECRET,
  check: () => checkReadiness(createReadinessDeps()),
});

export const Route = createFileRoute("/api/internal/readiness")({
  server: {
    handlers: {
      GET: ({ request }) => handleReadiness(request),
    },
  },
});
