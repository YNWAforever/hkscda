export type VerifiedPrincipal = {
  authUserId: string;
  email: string;
};

type AuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
};

export type AuthReader = {
  getUser(token: string): Promise<{
    data: { user: AuthUser | null };
    error: unknown;
  }>;
};

export type PortalRecords = {
  adoption: Array<{ id: string; createdAt: string; updatedAt: string }>;
  sponsorship: Array<{ id: string; status: string; createdAt: string; amountCents: number }>;
  donations: Array<{ id: string; status: string; createdAt: string; amountCents: number }>;
  receipts: Array<{
    id: string;
    receiptNo: string;
    issuedAt: string;
    totalAmountCents: number;
    downloadable: boolean;
  }>;
  marketingEmail: "opt_in" | "opt_out" | null;
};

export type PortalRepository = {
  listByEmail(email: string): Promise<PortalRecords>;
};

export async function requireVerifiedPrincipal(
  request: Request,
  auth: AuthReader,
  now = () => new Date(),
): Promise<VerifiedPrincipal> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new Response("Authentication required", { status: 401 });
  const { data, error } = await auth.getUser(token);
  if (error || !data.user) throw new Response("Session expired", { status: 401 });
  const user = data.user;
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.email_confirmed_at) {
    throw new Response("Email verification required", { status: 403 });
  }
  if (user.banned_until) {
    const bannedUntil = Date.parse(user.banned_until);
    if (!Number.isFinite(bannedUntil) || bannedUntil > now().getTime()) {
      throw new Response("Account suspended", { status: 403 });
    }
  }
  return { authUserId: user.id, email };
}

export async function listMyRecords(
  principal: VerifiedPrincipal,
  repository: PortalRepository,
): Promise<PortalRecords> {
  return repository.listByEmail(principal.email);
}
