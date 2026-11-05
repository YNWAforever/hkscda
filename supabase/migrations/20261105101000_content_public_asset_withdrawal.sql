-- BUG-72: withdraw public image copies a story no longer uses.
-- Published images are copied to the public content-media bucket at
-- published/<revision>/<media>.<ext> (one content_public_asset row per object). Nothing removed
-- them when a newer revision was published or the story was archived, so a photo taken out of
-- a story stayed reachable at its old URL.
--
-- This migration records, in the same transaction as the publish or archive, which copies the
-- current published revision of a published item no longer uses (withdrawn_at). The cron
-- /api/jobs/public-media-repair deletes those objects through the Storage API and marks them
-- removed (removed_at) with a lease, so a deletion is idempotent and a storage failure leaves
-- the row for the next run. Existing rows are not backfilled: an item's older copies are
-- marked the next time it is published or archived.

alter table public.content_public_asset
  add column withdrawn_at timestamptz,
  add column removed_at timestamptz,
  add column removal_claimed_at timestamptz,
  add column removal_lease_token uuid,
  add constraint content_public_asset_removed_after_withdrawal_check
    check (removed_at is null or withdrawn_at is not null);

create index content_public_asset_withdrawn_due_idx
  on public.content_public_asset(withdrawn_at, id)
  where withdrawn_at is not null and removed_at is null;

-- Runs inside the UPDATE that publishes (moves published_revision_id) or archives the item,
-- whichever function or statement issues it.
create function private.withdraw_unused_content_public_assets()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Copies of every other revision, or every copy once the item is no longer published.
  update public.content_public_asset asset
  set withdrawn_at = pg_catalog.now(), removal_claimed_at = null, removal_lease_token = null
  where asset.content_item_id = new.id
    and asset.withdrawn_at is null
    and (new.status is distinct from 'published' or asset.revision_id is distinct from new.published_revision_id);

  if new.status = 'published' and new.published_revision_id is not null then
    -- A revision published again keeps copies that were withdrawn but not yet deleted. A
    -- removal lease is kept so a deletion already in flight is recognised when acknowledged.
    update public.content_public_asset asset
    set withdrawn_at = null
    where asset.content_item_id = new.id
      and asset.revision_id = new.published_revision_id
      and asset.withdrawn_at is not null
      and asset.removed_at is null;
    -- Copies already deleted go back to the repair queue to be copied again.
    update public.content_public_asset asset
    set withdrawn_at = null, removed_at = null, ready = false, repair_status = 'pending',
        repair_attempts = 0, next_retry_at = pg_catalog.now(), last_error_code = null,
        copy_claimed_at = null, lease_token = null
    where asset.content_item_id = new.id
      and asset.revision_id = new.published_revision_id
      and asset.removed_at is not null;
  end if;
  return null;
end
$$;

create trigger withdraw_unused_content_public_assets
  after update of status, published_revision_id on public.content_item
  for each row
  when (old.status is distinct from new.status
    or old.published_revision_id is distinct from new.published_revision_id)
  execute function private.withdraw_unused_content_public_assets();

-- Leases withdrawn copies for deletion. Never returns a copy of the item's current published
-- revision, even if one were marked withdrawn.
create function public.claim_withdrawn_content_public_assets(p_limit integer default 50)
returns setof public.content_public_asset
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select asset.id
    from public.content_public_asset asset
    join public.content_item item on item.id = asset.content_item_id
    where asset.withdrawn_at is not null and asset.removed_at is null
      and not (item.status = 'published' and item.published_revision_id is not distinct from asset.revision_id)
      and (asset.removal_claimed_at is null
        or asset.removal_claimed_at < pg_catalog.clock_timestamp() - interval '15 minutes')
    order by asset.withdrawn_at, asset.id
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    for update of asset skip locked
  )
  update public.content_public_asset asset
  set removal_claimed_at = pg_catalog.clock_timestamp(),
      removal_lease_token = pg_catalog.gen_random_uuid()
  from candidates
  where asset.id = candidates.id
  returning asset.*;
$$;

-- Acknowledges a deletion under the caller's lease. If the copy became current again while it
-- was being deleted (the item was republished with its revision), it is queued to be copied
-- back instead, and false is returned.
create function public.mark_content_public_asset_removed(p_asset_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.content_public_asset asset
  set removed_at = pg_catalog.clock_timestamp(), removal_claimed_at = null, removal_lease_token = null
  where asset.id = p_asset_id
    and asset.withdrawn_at is not null and asset.removed_at is null
    and asset.removal_lease_token = p_lease_token
    and not exists (select 1 from public.content_item item where item.id = asset.content_item_id and item.status = 'published' and item.published_revision_id = asset.revision_id);
  if found then return true; end if;
  update public.content_public_asset asset
  set ready = false, repair_status = 'pending', repair_attempts = 0,
      next_retry_at = pg_catalog.clock_timestamp(), last_error_code = null,
      copy_claimed_at = null, lease_token = null,
      withdrawn_at = null, removal_claimed_at = null, removal_lease_token = null
  where asset.id = p_asset_id and asset.removed_at is null
    and asset.removal_lease_token = p_lease_token
    and exists (select 1 from public.content_item item where item.id = asset.content_item_id and item.status = 'published' and item.published_revision_id = asset.revision_id);
  return false;
end
$$;

revoke all on function private.withdraw_unused_content_public_assets() from public,anon,authenticated;
revoke all on function public.claim_withdrawn_content_public_assets(integer) from public,anon,authenticated;
revoke all on function public.mark_content_public_asset_removed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_withdrawn_content_public_assets(integer) to service_role;
grant execute on function public.mark_content_public_asset_removed(uuid,uuid) to service_role;
