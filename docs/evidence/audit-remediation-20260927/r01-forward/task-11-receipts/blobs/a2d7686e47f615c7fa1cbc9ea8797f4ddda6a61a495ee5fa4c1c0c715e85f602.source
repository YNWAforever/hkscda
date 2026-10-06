-- Stops a species correction from silently destroying catalogue membership.
--
-- set_animal_catalog_membership_defaults (20260906162436) has an UPDATE branch
-- that fires when `type` moves into or out of 'sponsor' while both eligibility
-- flags are unchanged, and rewrites them from the species:
--
--     NEW.adoption_eligible    := (NEW.type IN ('cat','dog'));
--     NEW.sponsorship_eligible := (NEW.type = 'sponsor');
--
-- That made sense when eligibility was DERIVED from type. It is now the
-- opposite of what is wanted, and it is the single thing blocking the legacy
-- 'sponsor' species value from ever being retired.
--
-- The plan requires species to be cat or dog only, with sponsorship expressed
-- as eligibility. Retiring the value therefore means correcting each
-- type='sponsor' animal to its real species. But under the rule above, doing
-- exactly that -- changing type from 'sponsor' to 'cat' and leaving the
-- eligibility checkboxes alone, which is precisely what a staff member
-- correcting a species would do -- sets sponsorship_eligible to FALSE and
-- silently removes the animal from the sponsorship catalogue. The correction
-- that is supposed to be housekeeping quietly unsponsors an animal that people
-- may already be paying for.
--
-- The INSERT branch is kept verbatim: a caller that creates an animal without
-- stating its memberships still gets a sensible default, and nothing depends on
-- the UPDATE branch to be correct -- the CMS now sets both flags explicitly on
-- every save.
--
-- Removing the UPDATE branch makes a species change PRESERVE membership, which
-- is the right default under the plan's preservation rules: a correction to a
-- record's species is not a statement about which programmes it belongs to.
-- Callers that genuinely want to change membership set the flags, which they
-- can now do from the editor.
--
-- No row is modified by this migration. It changes only what happens on FUTURE
-- updates, and it is idempotent.

create or replace function public.set_animal_catalog_membership_defaults()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- Unchanged from 20260906162436: derive only when the caller said nothing.
    new.adoption_eligible := coalesce(new.adoption_eligible, new.type in ('cat', 'dog'));
    new.sponsorship_eligible := coalesce(new.sponsorship_eligible, new.type = 'sponsor');
  end if;
  -- On UPDATE the flags are left exactly as supplied. Correcting a species
  -- never changes which catalogues an animal belongs to.
  return new;
end;
$$;

revoke all on function public.set_animal_catalog_membership_defaults() from public;

comment on function public.set_animal_catalog_membership_defaults() is
  'Defaults catalogue membership from species on INSERT only. An UPDATE preserves '
  'adoption_eligible and sponsorship_eligible exactly as supplied, so correcting an '
  'animal''s species cannot remove it from a catalogue.';
