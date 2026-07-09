# Admin Animal Pipeline Query Plan Evidence

Date: 2026-07-10

## Endpoint Shape

`GET /api/admin/adoptions/animals/pipeline` now replaces the browser-side full-table load for the coordinator animal pipeline.

The repository query has four phases:

1. Text search candidate IDs, only when `q` is present:
   - `animals.select("id").or("name.ilike...,name_en.ilike...,type.ilike...,status.ilike...")`
   - `animal_profile_internal.select("animal_id").or("internal_code.ilike...,cage.ilike...")`
2. Profile-filter candidate IDs, only when profile filters are active:
   - `animal_profile_internal.select("animal_id")`
   - optional equality filters on `is_adoptable`, `is_inside_support_pool`, and `current_position_id`
3. Counted page query:
   - `animals.select("id,type,name,name_en,gender,age,status,image_url,created_at,updated_at", { count: "exact" })`
   - optional equality filters on `id`, `status`, `type`
   - optional `id in (...)` candidate ID restriction
   - `order updated_at desc, name asc`
   - `range(pageStart, pageEnd)`
4. Page-only hydration:
   - `animal_profile_internal.in("animal_id", pageAnimalIds)`
   - `animal_position.in("id", pagePositionIds)`
   - `arrival_source.in("id", pageSourceIds)`

The repository test `lists animal pipeline rows from a counted animal page with profile filters` verifies this call shape, including the counted `animals` range and page-only profile hydration.

## Existing Index Coverage

Existing migrations already include:

- `animals.id` primary key.
- `animal_profile_internal.animal_id` primary key.
- `animal_profile_internal_position_idx` on `current_position_id`.
- `animal_profile_internal_adoptable_idx` on `is_adoptable`.
- `pg_trgm` extension, used by donor/payment indexes.

Missing or unproven for this endpoint:

- No existing `animals` index for `status/type + updated_at desc + name`.
- No existing `animal_profile_internal` index for `is_inside_support_pool`.
- No existing trigram indexes for animal names or internal animal profile code/cage search.

## Evidence Gate

Do not add a migration until production-like `EXPLAIN (ANALYZE, BUFFERS)` confirms sequential scans or high buffer reads on real row counts.

Run these plans first:

```sql
explain (analyze, buffers)
select id, type, name, name_en, gender, age, status, image_url, created_at, updated_at
from public.animals
where status = 'available'
  and type = 'cat'
order by updated_at desc, name asc
limit 25 offset 0;

explain (analyze, buffers)
select animal_id
from public.animal_profile_internal
where is_adoptable = true
  and is_inside_support_pool = false
  and current_position_id = '00000000-0000-0000-0000-000000000000';

explain (analyze, buffers)
select id
from public.animals
where name ilike '%mochi%'
   or name_en ilike '%mochi%'
   or type ilike '%mochi%'
   or status ilike '%mochi%';

explain (analyze, buffers)
select animal_id
from public.animal_profile_internal
where internal_code ilike '%cat-204%'
   or cage ilike '%cat-204%';
```

If these plans show sequential scans at production row counts, consider a narrow migration with:

```sql
create index if not exists animals_status_type_updated_name_idx
  on public.animals (status, type, updated_at desc, name);

create index if not exists animal_profile_internal_support_position_idx
  on public.animal_profile_internal (is_inside_support_pool, current_position_id, animal_id);

create index if not exists animals_name_trgm_idx
  on public.animals using gin (name gin_trgm_ops);

create index if not exists animals_name_en_trgm_idx
  on public.animals using gin (name_en gin_trgm_ops)
  where name_en is not null;

create index if not exists animal_profile_internal_code_trgm_idx
  on public.animal_profile_internal using gin (internal_code gin_trgm_ops)
  where internal_code is not null;

create index if not exists animal_profile_internal_cage_trgm_idx
  on public.animal_profile_internal using gin (cage gin_trgm_ops)
  where cage is not null;
```
