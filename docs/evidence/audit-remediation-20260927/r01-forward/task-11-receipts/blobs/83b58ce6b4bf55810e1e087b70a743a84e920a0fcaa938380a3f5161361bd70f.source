-- Donation lifecycle integrity: enforce idempotency at the database layer for
-- the two places application logic could race or replay into duplicates —
-- donation acknowledgement emails and consent ledger entries.
--
-- These are partial/composite UNIQUE indexes, so they are the authoritative
-- guard even if a retry, concurrent webhook delivery, or double-click slips
-- past the application-level checks.

begin;

-- 1) One donation-acknowledgement message per (supporter, donation).
--    The reconcile path claims this row before sending email; the unique index
--    guarantees a redelivered/concurrent success event cannot double-send.
--    Pre-dedupe any historical duplicates (keep the earliest physical row) so
--    the index can be created on existing data.
delete from public.message m
using public.message d
where m.channel = 'email'
  and m.payload ->> 'kind' = 'donation_acknowledgement'
  and d.channel = 'email'
  and d.payload ->> 'kind' = 'donation_acknowledgement'
  and m.supporter_id = d.supporter_id
  and (m.payload ->> 'donationId') = (d.payload ->> 'donationId')
  and m.ctid > d.ctid;

create unique index if not exists message_donation_ack_unique
  on public.message (supporter_id, (payload ->> 'donationId'))
  where channel = 'email' and payload ->> 'kind' = 'donation_acknowledgement';

-- 2) De-duplicate the consent ledger. Repeated identical opt-in/opt-out events
--    (same supporter/channel/status/source/timestamp) are replays, not new
--    legal consent. Pre-dedupe historical duplicates, then enforce uniqueness.
delete from public.consent c
using public.consent d
where c.supporter_id = d.supporter_id
  and c.channel = d.channel
  and c.status = d.status
  and c.source = d.source
  and c."timestamp" = d."timestamp"
  and c.ctid > d.ctid;

create unique index if not exists consent_dedup_unique
  on public.consent (supporter_id, channel, status, source, "timestamp");

commit;
