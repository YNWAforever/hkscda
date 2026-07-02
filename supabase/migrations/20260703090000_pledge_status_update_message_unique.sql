-- Sponsorship pledge status-update emails: enforce idempotency at the
-- database layer, mirroring the donation-acknowledgement guard added in
-- 20260630120000_donation_lifecycle_integrity.sql.
--
-- sendPledgeStatusUpdateEmail (src/lib/sponsorshipAdmin/notifications.server.ts)
-- will be wired into recordPayment/reviewProof/cancelPledge admin actions. A
-- retried request, double-click, or replay of the same admin action must not
-- send the supporter a duplicate "pledge is now active/cancelled" email. The
-- claim insert happens before any external send; the unique index below makes
-- a redelivered/concurrent call for the same (supporter, reference, event) a
-- no-op via a 23505 conflict.
--
-- The key includes `event` (not just `reference`) because a single pledge
-- legitimately produces several distinct status-update emails over its
-- lifecycle (proof_recorded, then active or needs_followup, then possibly
-- cancelled) — those are different emails, not duplicates.

begin;

create unique index if not exists message_pledge_status_update_unique
  on public.message (supporter_id, (payload ->> 'reference'), (payload ->> 'event'))
  where channel = 'email' and payload ->> 'kind' = 'sponsorship_pledge_status_update';

commit;
