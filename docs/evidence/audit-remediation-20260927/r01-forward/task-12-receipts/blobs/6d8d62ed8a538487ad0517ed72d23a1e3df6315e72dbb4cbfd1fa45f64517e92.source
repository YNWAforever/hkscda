drop policy if exists "admin only" on public.adoption_applications;
drop policy if exists "staff can read adoption applications" on public.adoption_applications;
drop policy if exists "staff can update adoption applications" on public.adoption_applications;
drop policy if exists "staff can delete adoption applications" on public.adoption_applications;

create policy "staff can read adoption applications"
  on public.adoption_applications for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can update adoption applications"
  on public.adoption_applications for update
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can delete adoption applications"
  on public.adoption_applications for delete
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));
