-- Corrects the legacy `type='sponsor'` species placeholder from the source export.
--
-- This was previously recorded as "blocked on staff knowledge" on the assumption
-- that nothing said whether a sponsor-typed animal is a cat or a dog. That was
-- wrong. The legacy export carries only two species values -- cat (3,642) and
-- dog (1,278) -- and no 'sponsor' at all. `type='sponsor'` is an artefact of the
-- original import, not a fact about any animal, and every animal's real species
-- is recoverable from the source.
--
-- The join key is the reference number. In the source, all 4,920 live animals
-- carry a `code` and there are ZERO duplicates, so it identifies a record
-- exactly. Names are not used: the same source has 622 duplicate names, so
-- name matching would mis-assign at scale -- precisely the incorrect matching
-- the migration rules forbid.
--
-- Scope: the 128 source animals flagged `is_inside_support_pool`, which is the
-- population production imported as sponsorship animals (85 dog, 43 cat).
--
-- Safety properties:
--   * Only `type` is written. Eligibility, public_profile, status, retired_at
--     and the animal UUID are untouched -- correcting a species says nothing
--     about which catalogues a record belongs to.
--   * Only rows currently `type='sponsor'` are considered, so an animal whose
--     species is already correct is never rewritten.
--   * A row whose code is not in the mapping is LEFT ALONE, not guessed.
--   * Idempotent: after a successful run nothing matches `type='sponsor'`
--     any more, so a re-run updates zero rows.
--   * Depends on 20260911150000, which stopped the membership trigger rewriting
--     eligibility on a species change. Without that migration this one would
--     silently unsponsor all 128 animals.

create temporary table legacy_species_map (code text primary key, species text not null) on commit drop;

insert into legacy_species_map (code, species) values
    ('C1157', 'cat'),
    ('C1223', 'cat'),
    ('C1392', 'cat'),
    ('C1886', 'cat'),
    ('C1997', 'cat'),
    ('C2153', 'cat'),
    ('C2188', 'cat'),
    ('C24', 'cat'),
    ('C2502', 'cat'),
    ('C2527', 'cat'),
    ('C2656', 'cat'),
    ('C2820', 'cat'),
    ('C283', 'cat'),
    ('C2844', 'cat'),
    ('C2889', 'cat'),
    ('C2890', 'cat'),
    ('C2905', 'cat'),
    ('C3157', 'cat'),
    ('C3160', 'cat'),
    ('C3161', 'cat'),
    ('C3163', 'cat'),
    ('C3165', 'cat'),
    ('C3166', 'cat'),
    ('C3193', 'cat'),
    ('C3208', 'cat'),
    ('C3221', 'cat'),
    ('C3257', 'cat'),
    ('C3294', 'cat'),
    ('C3441', 'cat'),
    ('C3469', 'cat'),
    ('C3516', 'cat'),
    ('C3619', 'cat'),
    ('C3620', 'cat'),
    ('C3621', 'cat'),
    ('C3635', 'cat'),
    ('C3646', 'cat'),
    ('C3673', 'cat'),
    ('C3705', 'cat'),
    ('C3779', 'cat'),
    ('C391', 'cat'),
    ('C4', 'cat'),
    ('C6', 'cat'),
    ('C807', 'cat'),
    ('D1014', 'dog'),
    ('D1017', 'dog'),
    ('D1018', 'dog'),
    ('D1019', 'dog'),
    ('D1020', 'dog'),
    ('D1021', 'dog'),
    ('D1026', 'dog'),
    ('D1033', 'dog'),
    ('D1034', 'dog'),
    ('D1035', 'dog'),
    ('D1037', 'dog'),
    ('D1039', 'dog'),
    ('D1041', 'dog'),
    ('D1069', 'dog'),
    ('D1080', 'dog'),
    ('D1082', 'dog'),
    ('D1096', 'dog'),
    ('D1098', 'dog'),
    ('D1099', 'dog'),
    ('D1101', 'dog'),
    ('D1102', 'dog'),
    ('D1103', 'dog'),
    ('D1125', 'dog'),
    ('D1129', 'dog'),
    ('D1133', 'dog'),
    ('D1134', 'dog'),
    ('D1153', 'dog'),
    ('D1158', 'dog'),
    ('D1176', 'dog'),
    ('D1193', 'dog'),
    ('D1198', 'dog'),
    ('D1199', 'dog'),
    ('D1200', 'dog'),
    ('D1201', 'dog'),
    ('D1202', 'dog'),
    ('D1203', 'dog'),
    ('D1209', 'dog'),
    ('D1210', 'dog'),
    ('D1238', 'dog'),
    ('D1239', 'dog'),
    ('D1240', 'dog'),
    ('D1247', 'dog'),
    ('D1273', 'dog'),
    ('D1274', 'dog'),
    ('D1275', 'dog'),
    ('D128', 'dog'),
    ('D129', 'dog'),
    ('D1298', 'dog'),
    ('D1302', 'dog'),
    ('D132', 'dog'),
    ('D133', 'dog'),
    ('D1338', 'dog'),
    ('D137', 'dog'),
    ('D186', 'dog'),
    ('D292', 'dog'),
    ('D382', 'dog'),
    ('D385', 'dog'),
    ('D436', 'dog'),
    ('D438', 'dog'),
    ('D559', 'dog'),
    ('D569', 'dog'),
    ('D587', 'dog'),
    ('D645', 'dog'),
    ('D667', 'dog'),
    ('D676', 'dog'),
    ('D677', 'dog'),
    ('D718', 'dog'),
    ('D782', 'dog'),
    ('D791', 'dog'),
    ('D814', 'dog'),
    ('D816', 'dog'),
    ('D834', 'dog'),
    ('D836', 'dog'),
    ('D842', 'dog'),
    ('D887', 'dog'),
    ('D910', 'dog'),
    ('D956', 'dog'),
    ('D959', 'dog'),
    ('D966', 'dog'),
    ('D967', 'dog'),
    ('D968', 'dog'),
    ('D969', 'dog'),
    ('D970', 'dog'),
    ('D975', 'dog'),
    ('D995', 'dog')
;

-- Report what will and will not be matched, so the operator sees the reconciliation.
do $$
declare v_sponsor int; v_matched int; v_unmatched int;
begin
  select count(*) into v_sponsor from public.animals where type = 'sponsor';
  select count(*) into v_matched from public.animals a
    join legacy_species_map m on m.code = a.public_profile->>'code'
    where a.type = 'sponsor';
  v_unmatched := v_sponsor - v_matched;
  raise notice 'legacy species correction: % sponsor-typed rows, % matched by reference number, % left unchanged',
    v_sponsor, v_matched, v_unmatched;
end $$;

update public.animals a
set type = m.species
from legacy_species_map m
where a.type = 'sponsor'
  and m.code = a.public_profile->>'code';
