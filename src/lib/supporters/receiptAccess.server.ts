import type { SupabaseClient } from "@supabase/supabase-js";

type ReceiptRow = {
  id: string;
  supporter_id: string;
  receipt_no: string;
  status: string;
  pdf_url: string | null;
  donation_ids: string[];
};

export function authorizeReceiptRow(
  receipt: ReceiptRow,
  supporterId: string,
  ownedDonationIds: string[],
): { path: string; fileName: string } | null {
  if (receipt.supporter_id !== supporterId || receipt.status !== "issued") return null;
  if (!receipt.pdf_url || !/^\d{4}\/[A-Za-z0-9._-]+\.pdf$/.test(receipt.pdf_url)) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(receipt.receipt_no)) return null;
  if (!receipt.donation_ids.length || receipt.donation_ids.length > 1_000) return null;
  const owned = new Set(ownedDonationIds);
  if (!receipt.donation_ids.every((id) => owned.has(id))) return null;
  return { path: receipt.pdf_url, fileName: receipt.receipt_no + ".pdf" };
}

function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Receipt access unavailable");
  return result.data;
}

export async function findAuthorizedReceipt(
  client: SupabaseClient,
  email: string,
  receiptId: string,
): Promise<{ path: string; fileName: string } | null> {
  const supporter = checked(
    await client
      .from("supporter")
      .select("id")
      .eq("email", email)
      .is("deleted_at", null)
      .maybeSingle(),
  ) as { id: string } | null;
  if (!supporter) return null;
  const receipt = checked(
    await client
      .from("receipt")
      .select("id,supporter_id,receipt_no,status,pdf_url,donation_ids")
      .eq("id", receiptId)
      .eq("supporter_id", supporter.id)
      .maybeSingle(),
  ) as ReceiptRow | null;
  if (!receipt || receipt.donation_ids.length > 1_000) return null;
  const matching = checked(
    await client
      .from("donation")
      .select("id")
      .eq("supporter_id", supporter.id)
      .eq("contact_email", email)
      .in("id", receipt.donation_ids),
  ) as Array<{ id: string }> | null;
  return authorizeReceiptRow(
    receipt,
    supporter.id,
    (matching ?? []).map((row) => row.id),
  );
}
