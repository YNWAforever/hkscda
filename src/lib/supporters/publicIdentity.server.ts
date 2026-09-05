import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicContact = {
  name: string;
  email: string;
  phone: string | null;
  language: "zh-HK" | "en";
  source: "donation_form" | "volunteer_registration_form";
};

export type IdentityResolution = {
  supporterId: string;
  kind: "created" | "existing";
};

export interface PublicIdentityRepository {
  resolve(contact: PublicContact): Promise<IdentityResolution>;
}

function normalizeContact(contact: PublicContact): PublicContact {
  return {
    ...contact,
    name: contact.name.trim(),
    email: contact.email.trim().toLowerCase(),
    phone: contact.phone?.trim() || null,
  };
}

function isIdentityResolution(value: unknown): value is IdentityResolution {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IdentityResolution>;
  return (
    typeof candidate.supporterId === "string" &&
    (candidate.kind === "created" || candidate.kind === "existing")
  );
}

export function createPublicIdentityRepository(client: SupabaseClient): PublicIdentityRepository {
  return {
    async resolve(contact) {
      const { data, error } = await client.rpc("resolve_public_supporter_identity", {
        p_contact: normalizeContact(contact),
      });
      if (error) throw error;
      if (!isIdentityResolution(data)) throw new Error("Invalid public identity resolution");
      return data;
    },
  };
}
