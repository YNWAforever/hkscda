-- Separates publication from care state on public.animals.
--
-- `status` has been doing two unrelated jobs. It records the care/case state
-- ('available' | 'adopted' | 'fostered'), and it is simultaneously the public
-- visibility switch, because the public RLS policy requires status='available'.
-- Staff therefore had no way to take a record off the public site without
-- claiming the animal had been adopted or fostered -- falsifying its care
-- record to achieve an editorial outcome -- and no way to prepare a profile
-- before it went live.
--
-- publication_state is that missing third axis, alongside the care state and
-- `retired_at` archival.
--
-- DELIBERATELY STRICTLY NARROWING. The new predicate is the old one AND
-- publication_state='published', and every existing row is backfilled to
-- 'published' by the column default. No animal that is private today becomes
-- public, and no animal that is public today disappears: visibility immediately
-- after this migration is identical to visibility immediately before it. The
-- only new capability is that staff can now withhold a record.
--
-- What this migration does NOT do, on purpose: it does not relax the
-- status='available' requirement. Doing so would let adopted and fostered
-- animals appear in the public catalogues -- people would apply for animals
-- that already have homes -- which is a product decision with real
-- consequences for applicants, not a schema tidy-up. The exact change is
-- described at the bottom so it can be reviewed and approved on its own merits
-- rather than smuggled in here.

alter table public.animals
  add column if not exists publication_state text not null default 'published';

-- Added separately from the column so a re-run cannot fail on an existing
-- constraint, and so the values are stated in one obvious place.
alter table public.animals
  drop constraint if exists animals_publication_state_check;
alter table public.animals
  add constraint animals_publication_state_check
  check (publication_state in ('draft', 'published', 'unpublished'));

comment on column public.animals.publication_state is
  'Public visibility, independent of the care state in `status` and of `retired_at` archival. '
  'draft = being prepared and never published; published = eligible to appear publicly; '
  'unpublished = withheld after having been published. Existing rows were backfilled to '
  'published so this column changed nobody''s visibility when it was introduced.';

-- The public read predicate gains one conjunct. Everything else is reproduced
-- verbatim from 20260906162436 so the diff is exactly the addition.
drop policy if exists "public read available" on public.animals;
create policy "public read available" on public.animals for select
using (
  status = 'available'
  and retired_at is null
  and publication_state = 'published'
  and (adoption_eligible or sponsorship_eligible)
);

-- Partial index matching the policy: the public catalogues are the highest
-- traffic reads in the product and animals carried no index other than its
-- primary key.
create index if not exists animals_public_catalogue_idx
  on public.animals (type)
  where status = 'available'
    and retired_at is null
    and publication_state = 'published'
    and (adoption_eligible or sponsorship_eligible);

-- Follow-up requiring its own approval, recorded here rather than applied:
--
--   Allowing a fostered animal to be shown publicly means replacing
--   `status = 'available'` with a predicate that admits 'fostered'. That is a
--   WIDENING change -- records currently hidden would become public -- so it
--   needs a decision about what the public catalogues are for, and about what
--   an applicant seeing a fostered animal is being invited to do. It is not
--   applied here.
