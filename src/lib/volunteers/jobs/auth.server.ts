import { timingSafeEqual } from "node:crypto";
export function authorizedCron(request: Request, secret: string | undefined) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret) return false;
  const tokenBytes = Buffer.from(token);
  const secretBytes = Buffer.from(secret);
  if (tokenBytes.length !== secretBytes.length) return false;
  return timingSafeEqual(tokenBytes, secretBytes);
}
