import { hasUnacceptedInvite, type AdminRole } from "../../../lib/admin/access";
import type { accessCopy } from "./copy";

type AccessCopy = (typeof accessCopy)["en"];

/** The part of an access row an action needs. */
export type AccessActionUser = { id: string; authUserId: string; email: string; role: AdminRole };

/** A role change or a disable, waiting for the admin to confirm it (BUG-56). */
export type AccessConfirmation =
  | { kind: "role"; user: AccessActionUser; role: AdminRole }
  | { kind: "disable"; user: AccessActionUser };

/** The dialog text for a pending confirmation. Removing an admin role or access is destructive. */
export function accessConfirmationText(confirmation: AccessConfirmation, t: AccessCopy) {
  if (confirmation.kind === "disable")
    return {
      title: t.confirmDisableTitle,
      consequence: t.confirmDisable(confirmation.user.email),
      confirmLabel: t.disable,
      destructive: true,
    };
  const { user, role } = confirmation;
  return {
    title: t.confirmRoleTitle,
    consequence: t.confirmRole(user.email, t.roles[user.role], t.roles[role]),
    confirmLabel: t.confirmRoleLabel,
    destructive: user.role === "admin" && role !== "admin",
  };
}

/** The PATCH a confirmed action sends: the same request the buttons sent directly before. */
export function accessConfirmationRequest(confirmation: AccessConfirmation) {
  return confirmation.kind === "role"
    ? { id: confirmation.user.id, input: { role: confirmation.role } }
    : { id: confirmation.user.id, input: { status: "disabled" as const } };
}

/**
 * The signed-in admin's own row. The server refuses a self-demotion (`self_demote`) and a
 * self-disable, so neither control is offered there.
 */
export function isOwnAccessRow(
  user: Pick<AccessActionUser, "authUserId">,
  currentAuthUserId: string | undefined,
) {
  return currentAuthUserId !== undefined && user.authUserId === currentAuthUserId;
}

/** Every successful access action clears an earlier error banner before refreshing. */
export function accessMutationSuccess({
  setError,
  invalidate,
}: {
  setError: (message: string | null) => void;
  invalidate: () => Promise<unknown>;
}) {
  return async () => {
    setError(null);
    await invalidate();
  };
}

/**
 * What a disabled row offers. A user who never accepted their invite is re-invited through
 * the invite endpoint (which re-opens a disabled row as pending), because the server refuses
 * to reactivate them (`invite_not_accepted`, BUG-55).
 */
export function disabledRowAction(user: {
  invitedAt: string | null;
  inviteAcceptedAt: string | null;
}): "reinvite" | "reactivate" {
  return hasUnacceptedInvite(user) ? "reinvite" : "reactivate";
}
