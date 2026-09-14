export const requiredVolunteerCapabilities = [
  "volunteer_admin_directory_read(uuid,jsonb)",
  "volunteer_legacy_identity_command(uuid,jsonb)",
  "volunteer_booking_command(uuid,jsonb)",
  "volunteer_operation_command(uuid,jsonb)",
  "volunteer_member_registrations(uuid,integer,integer,integer)",
  "volunteer_bulk_command(uuid,jsonb)",
  "volunteer_policy_settings_read(uuid)",
  "editorial_review_command(uuid,jsonb)",
  "editorial_review_queue(uuid,integer,text)",
  "animal_publication_command(uuid,jsonb)",
] as const;
export const requiredVolunteerMigrations = [
  "20260913180745",
  "20260913182552",
  "20260914160716",
  "20260914160736",
  "20260914163506",
  "20260914161341",
  "20260914162305",
  "20260914164558",
];
export type Capability = {
  signature: string;
  exists: boolean;
  service: boolean;
  anonymous: boolean;
  authenticated: boolean;
};
export type CompatibilitySnapshot = {
  capabilities: Capability[];
  migrations: string[];
  legacyAliasSafe: boolean;
};
export function assessVolunteerCompatibility(snapshot: CompatibilitySnapshot) {
  const blockers: string[] = [];
  for (const signature of requiredVolunteerCapabilities) {
    const capability = snapshot.capabilities.find((c) => c.signature === signature);
    if (!capability?.exists) blockers.push(`Missing database capability: ${signature}`);
    else if (!capability.service || capability.anonymous || capability.authenticated)
      blockers.push(`Incorrect RPC grants: ${signature}`);
  }
  for (const version of requiredVolunteerMigrations)
    if (!snapshot.migrations.includes(version))
      blockers.push(`Migration ledger missing: ${version}`);
  if (!snapshot.legacyAliasSafe)
    blockers.push(
      "Legacy reconciliation alias fix is missing or does not match the required capability",
    );
  return { ready: blockers.length === 0, blockers };
}
