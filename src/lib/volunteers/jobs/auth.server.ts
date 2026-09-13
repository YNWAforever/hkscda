import { timingSafeEqual } from "node:crypto";
export function authorizedCron(request: Request, secret: string | undefined) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}
