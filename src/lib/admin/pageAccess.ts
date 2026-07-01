import { redirect } from "@tanstack/react-router";

import {
  canRoleAccessAdminArea,
  getFirstAllowedAdminRoute,
  type AdminAccessArea,
  type AdminIdentity,
} from "./access";
import { fetchAdminJson } from "./http";
import { supabase } from "../supabase";

export type AdminMeResponse = {
  admin: AdminIdentity;
};

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
