import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";

import { createPaymentProviders } from "../../lib/donations/providers.server";
import { createDonation } from "../../lib/donations/service";
import {
  createSupabaseDonationRepository,
  createSupabaseServiceClient,
} from "../../lib/donations/supabase.server";

export const Route = createFileRoute("/api/donations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const client = createSupabaseServiceClient();
          const result = await createDonation({
            input: await request.json(),
            repository: createSupabaseDonationRepository(client),
            providers: createPaymentProviders(),
          });

          return Response.json(result);
        } catch (error) {
          if (error instanceof ZodError) {
            return Response.json(
              { error: "Invalid donation request", issues: error.issues },
              { status: 400 },
            );
          }
          console.error(error);
          return Response.json({ error: "Donation could not be created" }, { status: 500 });
        }
      },
    },
  },
});
