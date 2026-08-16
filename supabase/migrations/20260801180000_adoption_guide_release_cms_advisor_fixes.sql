create index if not exists adoption_guide_publish_requests_release_id_idx
  on public.adoption_guide_publish_requests (release_id);

create index if not exists adoption_guide_releases_archived_by_idx
  on public.adoption_guide_releases (archived_by);

create index if not exists adoption_guide_releases_created_by_idx
  on public.adoption_guide_releases (created_by);

create index if not exists adoption_guide_releases_en_asset_id_idx
  on public.adoption_guide_releases (en_asset_id);

create index if not exists adoption_guide_releases_knowledge_post_id_idx
  on public.adoption_guide_releases (knowledge_post_id);

create index if not exists adoption_guide_releases_published_by_idx
  on public.adoption_guide_releases (published_by);

create index if not exists adoption_guide_releases_submitted_by_idx
  on public.adoption_guide_releases (submitted_by);

create index if not exists adoption_guide_releases_updated_by_idx
  on public.adoption_guide_releases (updated_by);

create index if not exists adoption_guide_releases_zh_hk_asset_id_idx
  on public.adoption_guide_releases (zh_hk_asset_id);

drop policy if exists "staff can create draft adoption guide releases"
  on public.adoption_guide_releases;
create policy "staff can create draft adoption guide releases"
  on public.adoption_guide_releases for insert
  to authenticated
  with check (
    state = 'draft'
    and private.has_admin_role(array['staff', 'admin'])
    and exists (
      select 1
      from public.admin_user actor
      where actor.id = created_by
        and actor.id = updated_by
        and actor.auth_user_id = (select auth.uid())
        and actor.status = 'active'
        and actor.role in ('staff', 'admin')
    )
  );

drop policy if exists "staff can update draft adoption guide releases"
  on public.adoption_guide_releases;
create policy "staff can update draft adoption guide releases"
  on public.adoption_guide_releases for update
  to authenticated
  using (state = 'draft' and private.has_admin_role(array['staff', 'admin']))
  with check (
    state = 'draft'
    and private.has_admin_role(array['staff', 'admin'])
    and exists (
      select 1
      from public.admin_user actor
      where actor.id = updated_by
        and actor.auth_user_id = (select auth.uid())
        and actor.status = 'active'
        and actor.role in ('staff', 'admin')
    )
  );
