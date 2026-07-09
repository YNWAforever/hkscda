import { redirect } from "@tanstack/react-router";

import {
  canRoleAccessAdminArea,
  getFirstAllowedAdminRoute,
  type AdminAccessArea,
  type AdminIdentity,
} from "./access";
import { supabase } from "../supabase";

export type AdminMeResponse = {
  admin: AdminIdentity;
};

export async function getAdminAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("未登入");
  return session.access_token;
}

export async function fetchAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAdminAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : "API request failed");
  }

  return response.json() as Promise<T>;
}

export async function fetchAdminIdentity() {
  return fetchAdminJson<AdminMeResponse>("/api/admin/me");
}

export async function requireSignedInAdminIdentity() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw redirect({ to: "/admin/login" });
  return fetchAdminIdentity();
}

export async function requireAdminPageAccess(area: AdminAccessArea) {
  const { admin } = await requireSignedInAdminIdentity();
  if (!canRoleAccessAdminArea(admin.role, area)) {
    throw redirect({
      to: "/admin/access-denied",
      search: { area },
    } as never);
  }
  return admin;
}

export function firstAllowedAdminRouteForIdentity(admin: AdminIdentity | null | undefined) {
  return admin ? getFirstAllowedAdminRoute(admin.role) : "/admin/login";
}
