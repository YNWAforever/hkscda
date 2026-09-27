import type { SupabaseClient } from "@supabase/supabase-js";

import type { PortalRecords, PortalRepository } from "./portal.server";

type AdoptionRow = {
  id: string;
  applicant_email: string | null;
  created_at: string;
  updated_at: string;
};
type SponsorshipRow = {
  id: string;
  status: string;
  created_at: string;
  amount_cents: number;
  contact_submission: { email?: unknown } | null;
};
type DonationRow = {
  id: string;
  contact_email: string | null;
  status: string;
  created_at: string;
  amount_cents: number;
};
type ReceiptRow = {
  id: string;
  receipt_no: string;
  issued_at: string;
  total_amount_cents: number;
  status: string;
  pdf_url: string | null;
  donation_ids: string[];
};

export type PortalRows = {
  adoption: AdoptionRow[];
  sponsorship: SponsorshipRow[];
  donations: DonationRow[];
  receipts: ReceiptRow[];
  marketingEmail: "opt_in" | "opt_out" | null;
  ownedDonationIds?: string[];
};

const sameEmail = (a: string | null, b: string) => a?.trim().toLowerCase() === b;

export function projectPortalRows(email: string, rows: PortalRows): PortalRecords {
  const adoption = rows.adoption
    .filter((row) => sameEmail(row.applicant_email, email))
    .map((row) => ({ id: row.id, createdAt: row.created_at, updatedAt: row.updated_at }));
  const sponsorship = rows.sponsorship
    .filter(
      (row) =>
        typeof row.contact_submission?.email === "string" &&
        sameEmail(row.contact_submission.email, email),
    )
    .map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      amountCents: row.amount_cents,
    }));
  const donations = rows.donations
    .filter((row) => sameEmail(row.contact_email, email))
    .map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      amountCents: row.amount_cents,
    }));
  const ownedIds = new Set(rows.ownedDonationIds ?? donations.map((row) => row.id));
  const receipts = rows.receipts
    .filter(
      (row) =>
        row.status === "issued" &&
        row.donation_ids.length > 0 &&
        row.donation_ids.every((id) => ownedIds.has(id)),
    )
    .map((row) => ({
      id: row.id,
      receiptNo: row.receipt_no,
      issuedAt: row.issued_at,
      totalAmountCents: row.total_amount_cents,
      downloadable: Boolean(row.pdf_url),
    }));
  return { adoption, sponsorship, donations, receipts, marketingEmail: rows.marketingEmail };
}

function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Supporter records unavailable");
  return result.data;
}

export function createSupabasePortalRepository(client: SupabaseClient): PortalRepository {
  return {
    async listByEmail(email) {
      const supporter = checked(
        await client
          .from("supporter")
          .select("id")
          .eq("email", email)
          .is("deleted_at", null)
          .maybeSingle(),
      );
      if (!supporter) {
        return { adoption: [], sponsorship: [], donations: [], receipts: [], marketingEmail: null };
      }
      const id = (supporter as { id: string }).id;
      const [adoption, sponsorship, donations, receipts, consents] = await Promise.all([
        client
          .from("adoption_case")
          .select("id,applicant_email,created_at,updated_at")
          .eq("supporter_id", id)
          .eq("applicant_email", email)
          .order("created_at", { ascending: false })
          .order("id")
          .limit(25),
        client
          .from("sponsorship_pledge")
          .select("id,status,created_at,amount_cents,contact_submission")
          .eq("supporter_id", id)
          .order("created_at", { ascending: false })
          .order("id")
          .limit(25),
        client
          .from("donation")
          .select("id,contact_email,status,created_at,amount_cents")
          .eq("supporter_id", id)
          .eq("contact_email", email)
          .order("created_at", { ascending: false })
          .order("id")
          .limit(25),
        client
          .from("receipt")
          .select("id,receipt_no,issued_at,total_amount_cents,status,pdf_url,donation_ids")
          .eq("supporter_id", id)
          .eq("status", "issued")
          .order("issued_at", { ascending: false })
          .order("id")
          .limit(25),
        client
          .from("consent")
          .select("status")
          .eq("supporter_id", id)
          .eq("channel", "email")
          .order("timestamp", { ascending: false })
          .order("id", { ascending: false })
          .limit(1),
      ]);
      const adoptionRows = checked(adoption) as AdoptionRow[] | null;
      const sponsorshipRows = checked(sponsorship) as SponsorshipRow[] | null;
      const donationRows = checked(donations) as DonationRow[] | null;
      const receiptRows = checked(receipts) as ReceiptRow[] | null;
      const consentRows = checked(consents) as Array<{ status: string }> | null;
      const receiptIds = [...new Set((receiptRows ?? []).flatMap((row) => row.donation_ids))];
      let ownedDonationIds: string[] = [];
      if (receiptIds.length > 0 && receiptIds.length <= 1_000) {
        const matching = checked(
          await client
            .from("donation")
            .select("id")
            .eq("supporter_id", id)
            .eq("contact_email", email)
            .in("id", receiptIds),
        );
        ownedDonationIds = ((matching ?? []) as Array<{ id: string }>).map((row) => row.id);
      }
      const status = consentRows?.[0]?.status;
      return projectPortalRows(email, {
        adoption: adoptionRows ?? [],
        sponsorship: sponsorshipRows ?? [],
        donations: donationRows ?? [],
        receipts: receiptRows ?? [],
        ownedDonationIds,
        marketingEmail: status === "opt_in" || status === "opt_out" ? status : null,
      });
    },
  };
}
